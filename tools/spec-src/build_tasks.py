# -*- coding: utf-8 -*-
"""Generates docs/tasks/*.md (task cards), docs/tasks/README.md, docs/tasks/tasks.csv from the spec sources.
Every task: allowed_paths (CI-enforced), read-first anchors, mechanical deliverables, derived test cases, done-when commands.
Usage: python3 tools/spec-src/build_tasks.py [repo_root]"""
import csv, json, os, re, sys, collections
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rules_spec as RS
from api_errors_dtos import DTOS
from api_endpoints import EP
from states_spec import SM
from notify_spec import NT, JOBS
from screens_spec import SCR

OUT = sys.argv[1] if len(sys.argv) > 1 else str(HERE.parents[1])
TASKDIR = f"{OUT}/docs/tasks"
os.makedirs(TASKDIR, exist_ok=True)
ST = json.load(open(HERE / "stories.json", encoding="utf-8"))
STORY = {s["id"]: s for s in ST["stories"]}
MS = ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]
MSI = {m: i for i, m in enumerate(MS)}
EPK = {e["key"]: e for e in EP}
SCRK = {s["id"]: s for s in SCR}
RULEK = {r["id"]: r for r in RS.RULES}

def stories_in(text):
    out = set(re.findall(r"US-\d\d-\d\d", str(text)))
    for ep_, a, b in re.findall(r"US-(\d\d)-(\d\d)\.\.(\d\d)", str(text)):
        out |= {f"US-{ep_}-{i:02d}" for i in range(int(a), int(b) + 1)}
    return sorted(out & set(STORY))
def ms_of(text, default="M0"):
    st = stories_in(text)
    return min((STORY[s]["ms"] for s in st), key=lambda m: MSI[m]) if st else default
def primary_ms(text, default="M0"):
    """milestone of the FIRST story listed = the story the endpoint/screen is primarily built for"""
    m = re.search(r"US-\d\d-\d\d", str(text))
    return STORY[m.group(0)]["ms"] if m else default
def pascal(s): return "".join(p[:1].upper() + p[1:] for p in re.split(r"[_\-.]", s) if p)
def camel(s): p = pascal(s); return p[:1].lower() + p[1:]
def kebab(s): return re.sub(r"(?<!^)(?=[A-Z])", "-", s).lower()

# ---------------------------------------------------------------- mechanical paths
def route_file(e):
    if e["path"].startswith("/api/"):
        return "apps/web/app" + re.sub(r"\{(\w+)\}", r"[\1]", e["path"]) + "/route.ts"
    raise ValueError(e["path"])
def contract_file(e): return f"packages/contracts/src/endpoints/{e['key']}.ts"
def service_file(e):
    g, a = e["key"].split(".", 1)
    return f"packages/server/src/services/{g}/{a}.ts"
def service_test(e):
    g, a = e["key"].split(".", 1)
    return f"packages/server/test/services/{g}/{a}.test.ts"
def service_fn(e):
    g, a = e["key"].split(".", 1)
    return camel(g) + pascal(a)
def contract_names(e):
    g, a = e["key"].split(".", 1)
    base = pascal(g) + pascal(a)
    return f"{base}Request", f"{base}Response", f"{base}Query"
APP_GROUP = {"console": "(console)", "staff": "(staff)", "liff": "(liff)", "admin": "(admin)", "auth": "(auth)", "public": "(public)"}
def page_routes(s):
    return [p.strip().split("?")[0].strip() for p in s["route"].split("|") if p.strip().startswith("/")]
def page_files(s):
    return [f"apps/web/app/{APP_GROUP[s['app']]}{r}/page.tsx" for r in page_routes(s)]
def dto_file(name): return f"packages/contracts/src/dto/{kebab(name)}.ts"
def dto_refs(text):
    return [w for w in re.findall(r"\b([A-Z][A-Za-z]+)\b", str(text)) if w in DTOS]
def dto_closure(names):
    out, stack = [], list(names)
    while stack:
        n = stack.pop()
        if n in out: continue
        out.append(n)
        for _, src in DTOS[n]["fields"]:
            if src.startswith("dto:") or src.startswith("[]dto:"): stack.append(src.split(":", 1)[1])
    return out

# ---------------------------------------------------------------- task registry
TASKS = []          # dicts
BYKEY = {}          # internal key -> task
def task(key, title, ms, lane, size, stories="", allowed=None, read=None, deliver=None, steps=None, done=None, deps=None,
         out=None, human_review=False, agent="any", notes=None, artifacts=None, owner="agent"):
    t = dict(key=key, title=title, ms=ms, lane=lane, size=size, stories=stories_in(stories) if isinstance(stories, str) else stories,
             allowed=list(dict.fromkeys(allowed or [])), read=read or [], deliver=deliver or [], steps=steps or [], done=done or [],
             deps=list(deps or []), out=out or [], human_review=human_review, agent=agent, notes=notes or [], artifacts=artifacts or {},
             owner=owner)
    assert key not in BYKEY, key
    TASKS.append(t); BYKEY[key] = t
    return t

VERIFY = "pnpm verify"
CONF = "node scripts/check-spec-conformance.mjs"

# ================================================================= HUMAN tasks (owner = human)
H = lambda key, title, ms, stories, steps, deps=None, notes=None: task(key, title, ms, "human", "-", stories, steps=steps, deps=deps, owner="human", notes=notes)
H("H-REPO", "ตั้ง GitHub repo จาก starter kit + กฎ branch", "M0", "US-13-01", [
  "สร้าง private repo แล้ว push starter kit ทั้งหมด (รวม pnpm-lock.yaml) เป็น commit แรกบน main",
  "Branch protection บน main: require PR, require status check `ci / verify`, require 1 approval, require CODEOWNERS review, ห้าม force push",
  "สร้าง labels: `spec-change`, `infra-change`, `human-review`, `agent:claude`, `agent:codex`, `blocked`",
  "แก้ `.github/CODEOWNERS` แทน @OWNER ด้วย GitHub handle ของ tech owner (PR label infra-change)",
  "เปิด GitHub Actions; ทดสอบ PR ว่าง ๆ ให้ CI เขียว",
  "ติดตั้ง Claude Code และ Codex ให้ใช้ repo นี้ (ทั้งคู่อ่าน AGENTS.md อัตโนมัติ)"])
H("H-ADR-INFRA", "ตัดสินใจ ADR-002 hosting · ADR-003 email · ADR-004 storage + สร้างบัญชี/secret", "M0", "US-13-01, US-13-04", [
  "อ่าน docs/decisions/ADR-002..004 เลือกทางเลือก แล้วเปลี่ยนสถานะเป็น accepted (PR label spec-change)",
  "สร้างบัญชีตามที่เลือก (ฐานข้อมูล Postgres, object storage bucket แบบ private, SMTP, โดเมน)",
  "ใส่ secrets ใน hosting + GitHub Actions secrets ตาม docs/spec/01-architecture.md §6 (ห้ามส่ง secret ให้ agent ในแชท)",
  "สร้าง VAPID keys: `npx web-push generate-vapid-keys`; สร้าง APP_ENCRYPTION_KEY: `openssl rand -base64 32`"])
H("H-SP01", "SP-01 กลยุทธ์ LINE Provider → ADR-001", "M0", "US-13-02, US-02-06, US-01-01", [
  "ทดลองตาม docs/decisions/ADR-001 กับ OA ทดสอบ 2 ตัว (provider เดียวกัน/ต่างกัน) ดู userId จาก LIFF และ webhook",
  "ตัดสินใจ + เขียนขั้นตอนเชื่อม OA ร้าน (ใครสร้าง channel, สิทธิ์ admin ที่ต้องขอจากร้าน, LIFF scope, ปุ่ม add friend)",
  "อัปเดต ADR-001 เป็น accepted ก่อนเริ่ม M3"], notes=["ถ้าเลือกทางที่ต้องแก้ data model → เปิด spec-change PR ปรับ 02 ก่อน"])
H("H-LINE-PLATFORM", "สร้าง LINE Login channel ของแพลตฟอร์ม (สำหรับพนักงาน) + OA/LIFF ทดสอบ", "M2", "US-01-03, US-02-06", [
  "สร้าง LINE Login channel ใน provider ของแพลตฟอร์ม → PLATFORM_LINE_LOGIN_CHANNEL_ID/SECRET",
  "สร้าง OA + LINE Login + LIFF ทดสอบตาม ADR-001 สำหรับ staging (ใช้ใน E2E manual)",
  "ตั้ง callback URL ของ staging/production"], deps=["H-SP01"])
H("H-LEGAL", "ร่าง Privacy Notice / Terms / DPA / ข้อความยินยอมรูป + ตรวจแม่แบบใบยินยอม", "M1", "US-13-08, US-03-12, US-05-06, US-06-08", [
  "เขียนเนื้อหาไฟล์ตาม docs/spec/10-reference-data.md (LEGAL_DOCS) แล้ว commit ใน apps/web/content/legal/ (PR label spec-change)",
  "ให้ที่ปรึกษากฎหมายตรวจ PDPA (ฐานทางกฎหมาย, ระยะเก็บ, สิทธิ์เจ้าของข้อมูล, ผู้ประมวลผล)",
  "ตรวจข้อความแม่แบบ grooming_consent_text / boarding_agreement_text ใน 10-reference-data"])
H("H-SP02", "SP-02 เก็บสลิปจริง ≥ 6 ธนาคาร → เพิ่ม vectors R-05", "M2", "US-07-02", [
  "เก็บรูปสลิปจริง (ปิดชื่อ/เลขบัญชี) จาก KBank SCB BBL KTB Krungsri ttb + PromptPay wallet",
  "อ่าน QR ด้วย jsQR แล้วบันทึก payload; เทียบกับ R-05 parseSlipQr",
  "เพิ่ม cases ลง tools/spec-src/rules_spec.py (R-05) → `python3 tools/spec-src/build_spec.py` → PR spec-change"], deps=["H-REPO"])
H("H-SP04", "SP-04 ทดสอบ Web Push บนอุปกรณ์ร้านนำร่อง", "M2", "US-13-05, US-09-04", [
  "ทดสอบ Android Chrome, iPhone (Add to Home Screen, iOS ≥ 16.4), แท็บเล็ต — บันทึกผลใน docs/decisions/ADR-005-web-push-devices.md"])
H("H-SP05", "SP-05 ทดสอบพิมพ์ใบเสร็จ 58/80 มม. จาก browser", "M4", "US-08-05", [
  "ทดสอบกับเครื่องพิมพ์ของร้านนำร่อง ใช้หน้าจอ C-20 → บันทึกการตั้งค่า (margin, scale) ในคู่มือร้าน"])
H("H-ONBOARD", "ชุด onboarding ร้านนำร่อง (US-13-14)", "M2", "US-13-14", [
  "คู่มือสั้นภาษาไทย: ตั้งค่าร้าน, นำเข้า CSV, ใช้ปฏิทิน, ติดตั้ง Staff app + แจ้งเตือน",
  "เตรียมไฟล์ CSV ตัวอย่างจากข้อมูลจริงของร้านนำร่อง", "นัดเทรน 1 ชั่วโมงต่อร้าน"])
for m, rel in (("M2", "Release A"), ("M4", "Release B"), ("M6", "Release C")):
    H(f"H-GATE-{m}", f"{rel}: UAT + ตัดสินใจปล่อยร้านนำร่อง ({m})", m, "", [
      f"รัน E2E ของ {m} บน staging + ทดสอบด้วยมือกับข้อมูลจริงของร้านนำร่อง 1 วัน",
      "ตรวจ: tenant isolation (ลองเข้าข้อมูลร้านอื่น), เงิน (ยอดบิล/มัดจำ/เครดิต), สิทธิ์ role, ข้อความ LINE ไม่เกินงบ",
      "backup/restore ทดสอบจริง 1 ครั้ง", "บันทึกผลและ issue ที่ต้องแก้เป็น task ใหม่"])
for m in ("M0", "M1", "M3", "M5"):
    H(f"H-GATE-{m}", f"Milestone review {m}: demo + ตรวจคุณภาพ", m, "", [
      f"demo ฟีเจอร์ของ {m} บน staging", "สุ่มอ่าน PR 3 ชิ้นเทียบกับสเปก (field-level)", "ตอบ docs/questions.md ที่ค้างทั้งหมด"])

# ================================================================= INFRA (agent)
INF = lambda key, title, ms, size, stories, allowed, steps, done, deps=None, read=None, hr=False, notes=None, deliver=None: task(
    key, title, ms, "infra", size, stories, allowed=allowed, steps=steps, done=done + [VERIFY], deps=deps, read=read, human_review=hr, notes=notes, deliver=deliver)
INF("INF-WEB", "Scaffold apps/web (Next.js 16 + Tailwind + shadcn) + /api/health", "M0", "M", "US-13-01",
    ["apps/web/**", "pnpm-lock.yaml"],
    ["`apps/web/package.json` name `@app/web`, scripts dev/build/start/typecheck/test; deps: next, react, react-dom, tailwindcss, @tailwindcss/postcss, next-intl, zod (เวอร์ชันล่าสุดที่ pin ตรงตัว)",
     "next.config.ts: `transpilePackages: ['@app/contracts','@app/domain','@app/server','@app/db']`, `output: 'standalone'`",
     "route groups ว่าง (auth) (public) (console) (staff) (liff) (admin) แต่ละอันมี layout.tsx เปล่า — **ห้ามสร้าง page.tsx ที่ไม่อยู่ใน 06**",
     "ติดตั้ง shadcn/ui ลง src/components/ui: button, input, select, dialog, sheet, table, tabs, badge, toast(sonner), form, checkbox, radio-group, switch, textarea, calendar, popover, dropdown-menu, skeleton, card",
     "ฟอนต์ไทย: next/font/google `Noto_Sans_Thai` + `IBM_Plex_Sans_Thai` fallback",
     "`app/api/health/route.ts` (endpoint `health`): GET → `{ ok: true, db: 'unknown', version: process.env.NEXT_PUBLIC_APP_VERSION }` (db check เพิ่มใน INF-MON)"],
    ["pnpm --filter @app/web build", CONF], deps=["H-REPO"], read=["docs/spec/01-architecture.md", "docs/spec/05-api.md#ep-health"])
INF("INF-CONTRACTS", "Scaffold packages/contracts: common types, enums, errors", "M0", "M", "US-13-02",
    ["packages/contracts/**", "pnpm-lock.yaml"],
    ["package.json `@app/contracts` exports `./endpoints/*`, `./dto/*`, `./common`, `./enums`, `./errors` (ไม่มี barrel)",
     "src/common.ts: `Money = z.number().int()`, `IsoInstant`, `LocalDate` (`/^\\d{4}-\\d{2}-\\d{2}$/`), `LocalTime` (`/^\\d{2}:\\d{2}$/`), `Uuid`, `Paged(item)` → `{items, nextCursor}`, `ApiError` shape, `Warning`",
     "src/enums.ts: ทุก enum ใน 02 เป็น `as const` + zod enum (ชื่อ camelCase เช่น `bookingStatus`) ลำดับเหมือนเดิม",
     "src/errors.ts: `ErrorCode` union + `ERROR_HTTP` + `ERROR_MESSAGE_TH` จาก docs/spec/vectors/errors.json",
     "test/enums.test.ts: เทียบ enum ทุกตัวกับ `@app/db` pgEnum (devDependency) — ต้องเท่ากันทุกค่า", "test/errors.test.ts: เทียบกับ docs/spec/vectors/errors.json"],
    ["pnpm --filter @app/contracts test"], deps=["H-REPO"], read=["docs/spec/05-api.md (§0, §1)", "docs/spec/02-data-model.md (Enums)", "packages/contracts/AGENTS.md"])
INF("INF-DB-CLIENT", "DB client (postgres-js) + migrate script + vaccine_type seed migration", "M0", "M", "US-13-02, US-03-05",
    ["packages/db/src/client.ts", "packages/db/src/migrate.ts", "packages/db/package.json", "packages/db/migrations/**", "packages/db/test/seed-reference.test.ts", "pnpm-lock.yaml"],
    ["src/client.ts: `createDb(url)` ด้วย drizzle-orm/postgres-js + `postgres` (max 10 connections) export type `Db`",
     "src/migrate.ts + script `db:migrate` (drizzle migrator, ใช้ DATABASE_URL)",
     "custom migration `pnpm --filter @app/db generate:custom seed_vaccine_types`: INSERT vaccine_type ตาม docs/spec/vectors/reference-data.json (ON CONFLICT DO NOTHING)",
     "test: createTestDb() แล้ว vaccine_type มี 6 แถวตรง reference data"],
    ["pnpm --filter @app/db test"], deps=["H-REPO"], read=["docs/spec/10-reference-data.md", "packages/db/AGENTS.md"], hr=True)
INF("INF-SERVER", "Scaffold packages/server: RequestContext, AppError, tenantDb, withTx, test helpers", "M0", "L", "US-13-02",
    ["packages/server/package.json", "packages/server/tsconfig.json", "packages/server/vitest.config.ts", "packages/server/src/context.ts", "packages/server/src/errors.ts",
     "packages/server/src/db.ts", "packages/server/src/repo/**", "packages/server/test/helpers/**", "packages/server/test/core/**", "pnpm-lock.yaml"],
    ["context.ts: `RequestContext` ตาม 01 §4 + `makeSystemCtx(orgId, now)`",
     "errors.ts: `class AppError(code: ErrorCode, details?)`; `mapPgError(e)`: 23P01 + constraint `groom_appt_*` → SLOT_TAKEN, `stay_room_no_overlap` → ROOM_TAKEN, `stay_pet_no_overlap` → PET_ALREADY_BOOKED; 23505 → ตามชื่อ unique index (`*_slug_uq` → SLUG_TAKEN, `staff_user_email_uq` → EMAIL_TAKEN, `*_code_uq` → CODE_TAKEN); 23503 on delete → IN_USE; อื่น ๆ → INTERNAL",
     "db.ts: `getDb()` (singleton จาก DATABASE_URL) + `withTx(ctx, fn)` + ทางฉีด db สำหรับเทสต์",
     "repo/tenant.ts: `tenantDb(ctx, tx)` คืน helper `select/insert/update` ที่บังคับ `organization_id = ctx.orgId` สำหรับตารางที่มีคอลัมน์นี้ (insert เติมให้อัตโนมัติ, update/select เติม where) — ตารางที่ไม่มี organization_id ต้องเข้าถึงผ่าน join ที่ตรวจ org",
     "test/helpers: `setupTestDb()` (createTestDb + seedBase), `staffCtx(base, role)`, `customerCtx`, `otherOrg()` (สร้าง org ที่ 2)",
     "test/core: tenantDb ไม่คืนแถวของ org อื่น; mapPgError ครบทุกกรณี"],
    ["pnpm --filter @app/server test"], deps=["INF-CONTRACTS", "INF-DB-CLIENT"], read=["docs/spec/01-architecture.md §3–§4", "packages/server/AGENTS.md", "docs/spec/02-data-model.md (§0 กติกา, Constraints)"], hr=True)
INF("INF-AUTH", "Auth core: sessions, argon2, cookies, permissions table", "M0", "L", "US-01-02, US-01-05, US-13-10",
    ["packages/server/src/auth/**", "packages/server/test/auth/**", "packages/server/package.json", "pnpm-lock.yaml"],
    ["auth/session.ts: สร้าง token 32 bytes (base64url) เก็บ sha256 ใน `session.token_hash`; อายุตาม 02 (staff 30 วัน sliding, customer 30 วัน, admin 12 ชม.); `lookupSession`, `revokeSession`, `revokeAllFor(subject)`",
     "auth/password.ts: argon2id ผ่าน `@node-rs/argon2` (memoryCost 19456, timeCost 2, parallelism 1) + ใช้ R-24 (`@app/domain/auth/lockout`)",
     "auth/cookies.ts: ชื่อ `sid` (staff) `cid` (customer) `aid` (admin) — HttpOnly, Secure (ยกเว้น dev), SameSite=Lax, Path=/",
     "auth/permissions.ts: map endpoint key → roles สร้างจาก docs/spec/vectors/permissions.json (เขียนเป็น TS literal) + `requireRole(ctx, key)`",
     "test: permissions.ts เท่ากับ permissions.json ทุก key; session หมดอายุ/revoke; R-24 lock หลัง 5 ครั้ง"],
    ["pnpm --filter @app/server test -- auth"], deps=["INF-SERVER", "DOM-R-24"], read=["docs/spec/04-business-rules.md#R-24", "docs/spec/08-permissions.md", "docs/spec/02-data-model.md#tbl-session"], hr=True)
INF("INF-HTTP", "Route wrappers: withStaff/withCustomer/withAdmin/withPublic + error JSON + CSRF + rate limit", "M0", "L", "US-13-01, US-13-11",
    ["packages/server/src/http.ts", "packages/server/src/http/**", "packages/server/test/http/**"],
    ["`withStaff(key, schemas, fn)` → Next.js handler: session จาก cookie → ctx (org suspended → FORBIDDEN) → requireRole → support mode + non-GET → SUPPORT_READ_ONLY → parse body/query/params ด้วย zod → fn → JSON (status 200/201/204)",
     "error → `{error:{code,message,details}}` ตาม docs/spec/vectors/errors.json; zod error → VALIDATION_FAILED + details.fields",
     "CSRF: method ≠ GET ต้องมี Origin = APP_BASE_URL (ยกเว้น webhook/cron)",
     "rate limit แบบ in-memory token bucket ต่อ key (ip/session) ตามตัวเลขใน 05 §0 → RATE_LIMITED",
     "withCustomer: ต้อง session customer ของ branchSlug ใน path; ยังไม่ลงทะเบียน → NOT_REGISTERED (ยกเว้น liff.register)",
     "test: ทุกเส้นทาง error ข้างบนด้วย Request จำลอง"],
    ["pnpm --filter @app/server test -- http"], deps=["INF-AUTH"], read=["docs/spec/05-api.md (§0, §1)", "docs/spec/01-architecture.md §4, §7"], hr=True)
INF("INF-AUDIT", "Audit log writer (R-27) + booking_event writer + state transition helper", "M1", "M", "US-13-07",
    ["packages/server/src/audit.ts", "packages/server/src/events.ts", "packages/server/src/state.ts", "packages/server/test/core/audit.test.ts", "packages/server/test/core/state.test.ts"],
    ["audit.ts: `writeAudit(tx, ctx, entry)` + `AuditAction` union = รายการใน R-27 ทั้งหมด; action ที่ต้องมี reason → ไม่มี → REASON_REQUIRED",
     "events.ts: `writeBookingEvent(tx, ctx, {bookingId, entityType, entityId, from, to, reason})`",
     "state.ts: `transition(tx, ctx, {table, id, machine, to, extraSet})` — ใช้ `canTransition` จาก @app/domain/state/<machine>, UPDATE … WHERE status IN (allowed from) RETURNING; 0 แถว → INVALID_TRANSITION",
     "test: transaction rollback แล้ว audit ไม่ถูกเขียน; INVALID_TRANSITION"],
    ["pnpm --filter @app/server test -- core"], deps=["INF-SERVER", "DOM-STATE"], read=["docs/spec/04-business-rules.md#R-27", "docs/spec/03-state-machines.md"], hr=True)
INF("INF-NOTIFY", "Notification outbox + dispatcher + stub templates ทุก key", "M1", "L", "US-13-05, US-13-06",
    ["packages/server/src/notify/**", "packages/server/test/notify/**"],
    ["notify/keys.ts: union ของ template key ทั้ง 38 ใน 07 + payload type ต่อ key (ตัวแปรในคอลัมน์ 'ตัวแปร')",
     "notify/templates/<key>.ts: สร้าง **stub ครบทุก key** (`render(payload) => { text }` คืนข้อความจากคอลัมน์ 'ข้อความ' แบบแทนตัวแปรตรง ๆ) — task template ภายหลังแก้เฉพาะไฟล์ของตัวเอง",
     "notify/enqueue.ts: `enqueueNotification(tx, ctx, {key, recipient, payload, dedupeKey})` insert notification queued (ON CONFLICT dedupe_key DO NOTHING) + month_key ท้องถิ่น",
     "notify/dispatch.ts: หลัง commit ส่งแถว queued: เลือกช่องทาง R-19, โควตา R-18 (นับ notification เดือนนี้), adapters `LineSender`, `WebPushSender`, `EmailSender` เป็น interface + fake ใน test (implementation จริงอยู่ใน task integrations)",
     "test: dedupe, skip reasons ทุกแบบ, economy mode, quota 80% เตือนเจ้าของครั้งเดียว"],
    ["pnpm --filter @app/server test -- notify"], deps=["INF-SERVER", "DOM-R-18", "DOM-R-19"], read=["docs/spec/07-notifications-jobs.md", "docs/spec/04-business-rules.md#R-18", "docs/spec/04-business-rules.md#R-19"])
INF("INF-JOBS", "Job runner + POST /api/cron/tick + stub handlers ทุก job_type", "M1", "L", "US-05-02, US-07-06, US-12-05",
    ["packages/server/src/jobs/**", "packages/server/test/jobs/**", "packages/server/src/services/cron/**", "packages/contracts/src/endpoints/cron.tick.ts", "apps/web/app/api/cron/tick/route.ts"],
    ["jobs/schedule.ts: `scheduleJob(tx, {type, runAt, payload, dedupeKey, orgId})` ON CONFLICT DO NOTHING; `cancelJobs(tx, dedupePrefix)`",
     "jobs/runner.ts: claim ≤ 50 งานด้วย FOR UPDATE SKIP LOCKED, รันแต่ละงานใน transaction, backoff 2^attempts นาที, ครบ 5 → failed, ปลดล็อก running > 10 นาที",
     "jobs/handlers/<job_type>.ts: stub ครบทั้ง 9 type (throw not implemented) + registry ครบ",
     "seed งานประจำ (owner_daily_summary ต่อสาขา, care_task_overdue_scan ทุก 15 นาที, recompute_reliability 03:00, package_expiry 00:10, cleanup 04:00) ด้วย dedupe key ตาม 07",
     "endpoint `cron.tick`: ตรวจ header x-cron-secret (CRON_FORBIDDEN) → seed → run → dispatch notification queued ค้าง > 1 นาที",
     "test: claim ไม่ซ้ำเมื่อรันพร้อมกัน 2 ตัว (PGlite 2 tx), backoff, failed"],
    ["pnpm --filter @app/server test -- jobs", CONF], deps=["INF-HTTP", "INF-NOTIFY"], read=["docs/spec/07-notifications-jobs.md §2–§3", "docs/spec/03-state-machines.md#sm-scheduled_job", "docs/spec/05-api.md#ep-cron.tick"])
INF("INF-STORAGE", "Object storage (presign) + upload-url endpoints + file commit + cleanup job", "M1", "M", "US-13-04",
    ["packages/server/src/integrations/storage/**", "packages/server/src/files.ts", "packages/server/test/files/**", "packages/server/src/jobs/handlers/cleanup_uncommitted_files.ts",
     "packages/server/src/services/staff/**", "packages/server/src/services/customer/**", "packages/server/test/services/staff/**", "packages/server/test/services/customer/**",
     "packages/contracts/src/endpoints/staff.uploadUrl.ts", "packages/contracts/src/endpoints/customer.uploadUrl.ts", "packages/contracts/src/dto/upload-ticket.ts",
     "apps/web/app/api/v1/staff/files/upload-url/route.ts", "apps/web/app/api/v1/liff/[branchSlug]/files/upload-url/route.ts", "packages/server/package.json", "pnpm-lock.yaml"],
    ["storage adapter (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`): presignPut (5 นาที), presignGet (1 ชม.), head, delete; fake adapter สำหรับเทสต์",
     "files.ts: `commitFile(tx, ctx, fileId, expectedKind)` ตรวจเจ้าของ org + HEAD มีจริง (FILE_NOT_UPLOADED) แล้วตั้ง committed_at; `signedUrl(fileId)`",
     "endpoint staff.uploadUrl / customer.uploadUrl ตาม R-25 (ลูกค้าได้เฉพาะ kind pet_profile, vaccine_proof, slip)",
     "handler cleanup_uncommitted_files ตาม 07"],
    ["pnpm --filter @app/server test -- files", CONF], deps=["INF-HTTP", "DOM-R-25", "INF-JOBS"], read=["docs/spec/04-business-rules.md#R-25", "docs/spec/05-api.md#ep-staff.uploadUrl", "docs/decisions/ADR-004-storage.md"], hr=True)
INF("INF-EMAIL", "Email adapter (SMTP/nodemailer) + templates invite/reset", "M1", "S", "US-01-02, US-01-04",
    ["packages/server/src/integrations/email/**", "packages/server/test/integrations/email.test.ts", "packages/server/package.json", "pnpm-lock.yaml"],
    ["EmailSender จริงด้วย nodemailer (SMTP_URL, MAIL_FROM) + fake", "ต่อเข้ากับ dispatcher ช่องทาง email"], ["pnpm --filter @app/server test -- email"],
    deps=["INF-NOTIFY", "H-ADR-INFRA"], read=["docs/decisions/ADR-003-email.md"])
INF("INF-WEBPUSH", "Web Push adapter + service worker + staff PWA manifest", "M2", "M", "US-13-05, US-09-04",
    ["packages/server/src/integrations/webpush/**", "packages/server/test/integrations/webpush.test.ts", "apps/web/public/sw.js", "apps/web/public/manifest.webmanifest",
     "apps/web/public/icons/**", "apps/web/src/lib/push.ts", "packages/server/package.json", "pnpm-lock.yaml"],
    ["`web-push` sender (VAPID env) ส่งทุก subscription ของ staff; 404/410 → disabled_at", "sw.js: รับ push แสดง notification + คลิกเปิด URL ใน payload",
     "manifest: name 'PJ-8 Staff', start_url /staff, display standalone", "lib/push.ts: ขอ permission + subscribe + ส่งไป staffMe.pushSubscribe"],
    ["pnpm --filter @app/server test -- webpush"], deps=["INF-NOTIFY", "INF-WEB"], read=["docs/spec/07-notifications-jobs.md", "docs/spec/06-screens.md#scr-C-45"])
INF("INF-LINE", "LINE integration: messaging client, ID token verify, webhook signature, secret encryption, fake mode", "M3", "L", "US-02-06, US-01-01, US-13-06",
    ["packages/server/src/integrations/line/**", "packages/server/src/crypto.ts", "packages/server/test/integrations/line/**", "packages/server/package.json", "pnpm-lock.yaml"],
    ["crypto.ts: AES-256-GCM encrypt/decrypt ด้วย APP_ENCRYPTION_KEY (iv สุ่มต่อค่า, เก็บ `v1:iv:tag:cipher` base64)",
     "line/messaging.ts: push/reply ผ่าน `@line/bot-sdk` ด้วย token ที่ถอดรหัสจาก line_channel; retry 3 ครั้งเฉพาะ 5xx; 401 → line_channel.status error",
     "line/idtoken.ts: verify ID token ที่ https://api.line.me/oauth2/v2.1/verify (client_id = login_channel_id) คืน sub/name/picture",
     "line/signature.ts: HMAC-SHA256 base64 เทียบแบบ timingSafeEqual",
     "LINE_FAKE=1 (ห้ามใน production): fake sender เก็บข้อความใน memory + fake idtoken รูปแบบ `fake:<userId>:<name>` สำหรับ dev/E2E",
     "ต่อ LineSender เข้ากับ dispatcher (reply token store ตาม R-19 / SP-03)"],
    ["pnpm --filter @app/server test -- line"], deps=["INF-NOTIFY", "H-SP01"], read=["docs/decisions/ADR-001-line-provider.md", "docs/spec/04-business-rules.md#R-19", "docs/spec/01-architecture.md §7"], hr=True)
INF("INF-I18N", "i18n: next-intl (th), message namespaces per screen + enum labels + format helpers", "M1", "M", "US-13-03",
    ["apps/web/src/i18n/**", "apps/web/scripts/merge-messages.mjs", "apps/web/package.json", "apps/web/src/lib/format.ts", "apps/web/src/lib/enum-label.ts", "apps/web/next.config.ts"],
    ["messages/th/common.json (ปุ่ม/คำทั่วไป), messages/th/enum.json คัดลอกจาก docs/spec/enum-labels.th.json",
     "scripts/merge-messages.mjs: รวม th/*.json → th.generated.json (gitignore) รันใน predev/prebuild/pretest",
     "lib/format.ts: re-export formatTHB/formatThaiDate/formatTime/formatWeight/formatPhone จาก @app/domain (R-31, R-22)",
     "lib/enum-label.ts: `enumLabel(enumName, value)`"],
    ["pnpm --filter @app/web build"], deps=["INF-WEB", "DOM-R-31", "DOM-R-22"], read=["docs/spec/06-screens.md (กติการ่วม)", "docs/spec/enum-labels.th.json", "docs/spec/04-business-rules.md#R-31"])
INF("INF-APICLIENT", "Typed API client + query hooks + error toast", "M1", "S", "US-13-01",
    ["apps/web/src/lib/api.ts", "apps/web/src/lib/query.ts", "apps/web/test/api.test.ts", "apps/web/package.json", "pnpm-lock.yaml"],
    ["`api(key, {params, query, body})` ใช้ endpoints.json (method/path) + schema จาก @app/contracts/endpoints/<key> (validate response ใน dev)",
     "TanStack Query hooks: `useApiQuery(key, …)`, `useApiMutation(key)` + invalidate", "error → toast ข้อความไทยจาก error.message"],
    ["pnpm --filter @app/web test"], deps=["INF-WEB", "INF-CONTRACTS"], read=["docs/spec/05-api.md §0"])
for app, title, routes in (("console", "Console shell: layout + sidebar (ครบทุกเมนูใน 06) + auth guard", "C-"), ("staff", "Staff PWA shell: bottom nav + auth guard (role ใดก็ได้)", "S-"),
                           ("liff", "LIFF shell: liff.init + session + header ร้าน", "L-"), ("admin", "Admin shell: layout + guard", "AD-")):
    task(f"UI-SHELL-{app}", title, {"console": "M1", "staff": "M2", "liff": "M3", "admin": "M0"}[app], "ui", "M", "US-13-01",
         allowed=[f"apps/web/app/({app})/layout.tsx", f"apps/web/app/({app})/{app}/layout.tsx", f"apps/web/src/components/shell-{app}/**", f"apps/web/src/i18n/messages/th/shell-{app}.json"]
         + (["apps/web/app/(liff)/liff/[branchSlug]/layout.tsx", "apps/web/src/lib/liff.ts", "apps/web/package.json", "pnpm-lock.yaml"] if app == "liff" else []),
         steps=[f"layout ของ route group ({app}) ตามกติการ่วมใน 06 + เมนู/ลิงก์ไปทุกหน้าจอ `{routes}*` ใน 06 (หน้าที่ยังไม่ทำแสดง disabled)",
                "server-side guard: อ่าน session (sid/cid/aid) → ไม่มี → redirect หน้าเข้าสู่ระบบที่ถูกต้อง; role ไม่ถึง → หน้า 403",
                "แถบแดง 'โหมดช่วยเหลือ (อ่านอย่างเดียว)' เมื่อ ctx.supportMode" if app == "console" else
                ("liff.init ด้วย liff_id ของสาขา (จาก liff.shop) → getIDToken → liff.session; LINE_FAKE โหมด dev ใช้ fake token" if app == "liff" else "ใช้ได้ที่ 360px")],
         done=["pnpm --filter @app/web build", CONF, VERIFY], deps=["INF-I18N", "INF-APICLIENT"] + (["INF-LINE"] if app == "liff" else []) + (["H-LINE-PLATFORM"] if app == "staff" else []),
         read=["docs/spec/06-screens.md", "docs/spec/08-permissions.md"])
task("INF-E2E", "Playwright setup + dev seed (ร้านตัวอย่างครบ) + smoke test", "M1", "infra", "M", "US-13-14",
     allowed=["apps/web/playwright.config.ts", "apps/web/e2e/**", "packages/server/src/dev/**", "packages/server/package.json"],
     steps=["packages/server/src/dev/seed.ts + script `db:seed`: ร้านตัวอย่าง (owner/front_desk/2 ช่าง, บริการ 5 รายการพร้อมราคาทุกขนาด, ห้อง 2 ประเภท 6 ห้อง, Daycare 3 รอบ, ลูกค้า 10 คน น้อง 14 ตัว)",
            "playwright.config.ts: webServer = next start + PGlite/Postgres ทดสอบ, LINE_FAKE=1, ใช้ Chromium ที่ติดตั้งแล้ว (ไม่ดาวน์โหลด)",
            "e2e/smoke.spec.ts: เปิด /login แล้วเห็นฟอร์ม"], done=["pnpm --filter @app/web exec playwright test e2e/smoke.spec.ts", VERIFY],
     deps=["INF-WEB", "INF-SERVER"], read=["docs/spec/10-reference-data.md"])
INF("INF-DEPLOY", "Deploy pipeline ตาม ADR-002 (staging + production) + migrate on deploy", "M0", "M", "US-13-01",
    ["deploy/**", "apps/web/Dockerfile", "docker-compose.yml", "docs/ops/**"],
    ["ตาม ADR-002 ที่ accepted: Dockerfile (Next standalone) หรือ config ของ host", "ขั้นตอน migrate ก่อนสลับเวอร์ชัน (`pnpm --filter @app/db db:migrate`)",
     "cron ภายนอกเรียก /api/cron/tick ทุก 2 นาที", "docs/ops/runbook.md: deploy, rollback, backup/restore (pg_dump รายวัน → object storage), หมุน secret"],
    ["(staging) curl /api/health ได้ ok"], deps=["INF-WEB", "INF-DB-CLIENT", "H-ADR-INFRA"], read=["docs/decisions/ADR-002-hosting.md", "docs/spec/01-architecture.md §6"], hr=True,
    notes=["ต้องมีมนุษย์ใส่ secret และกด deploy ครั้งแรก — agent เตรียมไฟล์และคู่มือเท่านั้น"])
INF("INF-MON", "Monitoring: health (db ping), structured logs, error reporting, uptime check", "M0", "S", "US-13-09",
    ["packages/server/src/log.ts", "packages/server/src/services/health/**", "apps/web/app/api/health/route.ts", "apps/web/instrumentation.ts", "docs/ops/monitoring.md"],
    ["log.ts: JSON log (requestId, orgId, key, ms, status) — ห้าม log body/secret", "health: SELECT 1 → db ok/error", "SENTRY_DSN มีค่า → ส่ง error (optional dependency ระบุใน card ถ้าใช้)",
     "docs/ops/monitoring.md: ตั้ง uptime monitor ฟรีเรียก /api/health ทุก 5 นาที แจ้งเตือนทางอีเมล/LINE ของทีม"],
    ["pnpm --filter @app/server test -- health"], deps=["INF-HTTP"], read=["docs/spec/05-api.md#ep-health"])

# ================================================================= shared UI components
COMP = {
 "UI-C-FORM": ("ฟอร์มพื้นฐาน: MoneyInput (บาท→สตางค์), PhoneInput (R-22), WeightInput (กก.→กรัม), ThaiDatePicker (พ.ศ.), TimeSelect, EnumSelect, zod form helper", "M1", ["DOM-R-22", "DOM-R-31"]),
 "UI-C-TABLE": ("DataTable (cursor pagination, ค้นหา, ตัวกรอง), EmptyState, StatusBadge (enum → สี + ป้ายไทย)", "M1", []),
 "UI-C-UPLOAD": ("PhotoUploader: กล้อง/อัลบั้ม, ย่อรูป 1600px + ลบ EXIF (R-25), presigned PUT, progress, หลายไฟล์", "M1", ["INF-STORAGE"]),
 "UI-C-SIGN": ("SignaturePad → PNG → อัปโหลด kind signature", "M2", ["UI-C-UPLOAD"]),
 "UI-C-SLOTS": ("SlotPicker: แถบวัน + grid เวลา จาก SlotList (R-04) + แสดงชื่อช่าง + สถานะว่าง/เต็ม", "M2", []),
 "UI-C-PAY": ("PromptPayQR (R-30) + Countdown + SlipUploader (jsQR อ่าน QR บนสลิป → qrPayload)", "M3", ["UI-C-UPLOAD", "DOM-R-30"]),
 "UI-C-CHART": ("BarChart/LineChart เบา ๆ (recharts) สำหรับรายงาน", "M6", []),
}
for key, (title, ms, deps) in COMP.items():
    slug = key.replace("UI-C-", "").lower()
    task(key, f"Shared component: {title}", ms, "ui", "M", "US-13-03", allowed=[f"apps/web/src/components/shared/{slug}/**", f"apps/web/test/components/{slug}/**", "apps/web/package.json", "pnpm-lock.yaml"],
         steps=[title, "เขียน component test (Vitest + Testing Library) ครอบคลุมการแปลงหน่วย/validation", "export จาก `components/shared/<slug>/index.ts` เท่านั้น"],
         done=["pnpm --filter @app/web test -- components/" + slug, VERIFY], deps=["INF-I18N"] + deps, read=["docs/spec/06-screens.md (กติการ่วม)"])

# ================================================================= DOMAIN
RULE_USE = collections.defaultdict(list)
for e in EP:
    for rid in re.findall(r"\bR-\d\d\b", e["rules"] + " " + " ".join(e["effects"])):
        RULE_USE[rid].append(e["key"])
def ep_ms(e):
    return primary_ms(e["stories"])
for r in RS.RULES:
    if r["id"] == "R-27": continue
    uses = [ep_ms(EPK[k]) for k in RULE_USE[r["id"]]]
    ms = min([ms_of(r["stories"])] + uses, key=lambda m: MSI[m])
    nv = sum(len(v["cases"]) for v in r["vectors"])
    size = "L" if r["id"] in ("R-04", "R-26", "R-13") else ("M" if nv > 8 or len(r["vectors"]) > 1 else "S")
    exports = ", ".join(f"`{v['export']}`" for v in r["vectors"])
    task(f"DOM-{r['id']}", f"Rule {r['id']} {r['name']}", ms, "domain", size, r["stories"],
         allowed=[r["file"], r["file"].replace("packages/domain/src/", "packages/domain/test/unit/").replace(".ts", ".test.ts"), "packages/domain/package.json", "pnpm-lock.yaml"],
         read=[f"docs/spec/04-business-rules.md#{r['id']}"] + [f"docs/spec/vectors/{r['id']}.{v['export']}.json" for v in r["vectors"]],
         deliver=[f"`{r['file']}` exports {exports} with the exact signature in 04"],
         steps=["คัดลอก type/signature จาก 04 ตรงตัว", "เขียนตาม 'อัลกอริทึม' ทีละข้อ (integer math, ไม่มี Date.now())",
                "ถ้าต้องการกรณีเพิ่มเติม เขียน unit test เพิ่มใน test/unit/ ได้ แต่ห้ามแตะ vectors"],
         done=[f"pnpm --filter @app/domain vectors:status {r['id']}", "pnpm --filter @app/domain test", VERIFY],
         deps=["H-REPO"] + (["DOM-R-20"] if r["id"] in ("R-04", "R-14", "R-16", "R-23", "R-26", "R-31") and r["id"] != "R-20" else []),
         notes=(["dependency ที่อนุญาต: date-fns, @date-fns/tz (เพิ่มใน package.json ของ domain ครั้งแรก)"] if r["id"] == "R-20" else []) + r["notes"][:1],
         human_review=r["id"] in ("R-06", "R-07", "R-13", "R-15", "R-16"))
task("DOM-STATE", "State tables ทุก entity (03) + canTransition", "M1", "domain", "M", "US-13-02",
     allowed=["packages/domain/src/state/**", "packages/domain/test/state.test.ts"],
     read=["docs/spec/03-state-machines.md", "docs/spec/vectors/state-machines.json"],
     steps=["src/state/<machine>.ts ต่อ machine ใน state-machines.json: `export const STATES`, `export const ALLOWED_TRANSITIONS: Record<From, To[]>` (รวม self-transition ถ้ามี, ไม่รวม ∅)", "`canTransition(from, to)`",
            "test/state.test.ts: โหลด state-machines.json แล้วเทียบทุก machine ว่า allowed transitions ตรงกันทุกคู่ (ห้ามเกิน/ขาด)"],
     done=["pnpm --filter @app/domain test", VERIFY], deps=["H-REPO"])

# ================================================================= API tasks
COMPLEX = {"bookings.create", "liff.createBooking", "bills.close", "bills.open", "bills.addPayment", "slips.verify", "availability.groomSlots", "liff.groomSlots",
           "groom.checkIn", "stays.checkIn", "stays.checkOut", "bookings.cancel", "liff.cancel", "liff.session", "liff.register", "auth.staffLogin", "admin.createOrg",
           "imports.create", "imports.commit", "webhook.line", "groom.reschedule", "liff.reschedule", "bills.void", "linkRequests.approve", "reportCards.submit",
           "stays.saveIntake", "calendar.day", "dashboard.today", "reports.sales", "quotes.create", "liff.quote", "stays.changeDates", "admin.verifyLine",
           "admin.resolveDataRequest", "services.setPrices", "sizeTiers.set", "customers.timeline", "groom.setItems", "bills.addLine"}
SPLIT = {  # key -> [(ms, suffix, scope_note)]
 "bookings.create": [("M2", "grooming", "รับเฉพาะ groom[] — ถ้ามี stays/daycare ให้ตอบ VALIDATION_FAILED (details: 'not yet supported') จนกว่าจะถึง task M5"),
                     ("M5", "hotel+daycare", "เพิ่ม stays[] (R-10/R-28, stay_addon, bundleGroom), daycare[] (R-29), vaccine warnings (R-11)")],
 "liff.createBooking": [("M3", "grooming", "รับเฉพาะ groom[] (+ มัดจำ/อนุมัติ) — stays/daycare ตอบ MODULE_DISABLED จนถึง M5"), ("M5", "hotel+daycare", "เพิ่ม stays[], bathBeforeCheckout, daycare[], vaccine gate")],
 "quotes.create": [("M2", "grooming", "groom[] เท่านั้น"), ("M5", "hotel+daycare", "เพิ่ม stays[]/daycare[]")],
 "liff.quote": [("M3", "grooming", "groom[] เท่านั้น"), ("M5", "hotel+daycare", "เพิ่ม stays[]/daycare[]")],
 "bills.open": [("M4", "grooming", "สร้าง bill_line จากกรูม (บริการ/add-on/surcharge/แพ็กเกจ) + มัดจำ"), ("M5", "hotel+daycare", "เพิ่ม stay_night, stay_addon, daycare")],
 "calendar.day": [("M2", "grooming", "ส่วน hotel/daycare คืน 0 จนถึง M5"), ("M5", "hotel+daycare", "เติม hotel.* และ daycare.count")],
}
EP_MS_OVERRIDE = {"health": "M0", "auth.me": "M0", "auth.staffLogout": "M0", "staffMe.sessions": "M1", "staffMe.revokeSession": "M1",
                  "staffMe.pushSubscribe": "M2", "staffMe.pushUnsubscribe": "M2", "admin.holidays": "M1", "closures.importHolidays": "M1",
                  "cron.tick": "M1", "staff.uploadUrl": "M1", "customer.uploadUrl": "M3", "webhook.line": "M3", "line.status": "M3", "line.skipped": "M3",
                  "dashboard.today": "M6", "feedback.create": "M2", "admin.feedback": "M2", "admin.updateFeedback": "M2"}
INFRA_OWNED = {"health": "INF-WEB", "cron.tick": "INF-JOBS", "staff.uploadUrl": "INF-STORAGE", "customer.uploadUrl": "INF-STORAGE"}

LIFF_MS = "M3"   # everything customer-facing in LINE starts when LINE integration lands
def ep_task_ms(e):
    ms = EP_MS_OVERRIDE.get(e["key"], ep_ms(e))
    if e["auth"] == "customer" and MSI[ms] < MSI[LIFF_MS]: ms = LIFF_MS
    return ms

def ep_size(e):
    n = len(e["req"]) + len(e["query"]) + 2 * len(e["effects"]) + len([x for x in e["errors"].split(",") if x.strip()])
    return "L" if e["key"] in COMPLEX or n > 22 else ("M" if n > 9 else "S")

def ep_deps(e):
    d = ["INF-HTTP"]
    if e["audit"]: d.append("INF-AUDIT")
    if e["notify"]: d.append("INF-NOTIFY")
    if e["transition"]: d += ["INF-AUDIT"]
    for rid in sorted(set(re.findall(r"\bR-\d\d\b", e["rules"] + " " + " ".join(e["effects"])))):
        if rid != "R-27" and f"DOM-{rid}" in BYKEY: d.append(f"DOM-{rid}")
    blob = json.dumps(e, ensure_ascii=False)
    if "fileId" in blob or "FileId" in blob or "proofFileId" in blob: d.append("INF-STORAGE")
    if e["auth"] == "customer" or e["key"].startswith(("liff.", "webhook.", "admin.setLine", "admin.verifyLine")) or "line_identity" in blob: d.append("INF-LINE")
    if "scheduled_job" in blob or "job " in blob or "ตั้ง job" in blob or "reminder_24h" in blob: d.append("INF-JOBS")
    return d

API_GROUPS = collections.OrderedDict()
GK_MS = {}
for e in EP:
    if e["key"] in INFRA_OWNED: continue
    if e["key"] in SPLIT:
        for ms, suf, note in SPLIT[e["key"]]:
            API_GROUPS.setdefault((ms, e["key"] + "#" + suf), []).append((e, suf, note))
        continue
    g = e["key"].split(".")[0]
    ms = ep_task_ms(e)
    if e["key"] in COMPLEX:
        API_GROUPS.setdefault((ms, e["key"]), []).append((e, None, None))
    else:
        # chunk simple endpoints of same group+milestone, max 3 per task; chunk ids are unique across milestones
        i = 0
        while True:
            gk = f"{g}~{i}"
            owner_ms = GK_MS.get(gk)
            if owner_ms is None or (owner_ms == ms and len(API_GROUPS[(ms, gk)]) < 3): break
            i += 1
        GK_MS[gk] = ms
        API_GROUPS.setdefault((ms, gk), []).append((e, None, None))

route_owner = {}   # route file -> task key (first)
DTO_OWNER = {}
def api_task(ms, gkey, items):
    eps = [x[0] for x in items]
    keys = [e["key"] for e in eps]
    suffix = items[0][1]
    tkey = f"API-{gkey.replace('~', '-').replace('#', '-')}"
    title = "API " + ", ".join(keys) + (f" ({suffix})" if suffix else "")
    allowed, read, deliver, steps, tests, done_tests, deps = [], [], [], [], [], [], []
    stories = []
    for e in eps:
        rf, cf, sf, tf = route_file(e), contract_file(e), service_file(e), service_test(e)
        req, res, qry = contract_names(e)
        allowed += [cf, sf, tf, rf]
        read.append(f"docs/spec/05-api.md#ep-{e['key']}")
        deliver += [f"`{cf}`: `{req}`" + (f", `{qry}`" if e["query"] else "") + f", `{res}` (ฟิลด์ตามตาราง endpoint ทีละช่อง)",
                    f"`{sf}`: `export async function {service_fn(e)}(ctx, input)`", f"`{rf}`: `export const {e['method']} = with{'Staff' if e['auth']=='staff' else 'Customer' if e['auth']=='customer' else 'Admin' if e['auth']=='admin' else 'Public'}(\"{e['key']}\", …, {service_fn(e)})`"]
        tests.append(f"**{e['key']}** ({e['method']} `{e['path']}`)")
        tests.append("  - happy path: response ตรง schema `" + res + "` และค่าที่บันทึกใน DB ตรงกับ 'maps to' ของแต่ละฟิลด์")
        for code in [c.strip() for c in e["errors"].split(",") if c.strip()]:
            tests.append(f"  - error `{code}`")
        tests.append("  - ฟิลด์บังคับขาด/ผิดรูปแบบ → `VALIDATION_FAILED`")
        if e["auth"] == "staff":
            denied = [r for r in "OFS" if r not in e["roles"]]
            if denied: tests.append("  - role " + "/".join({"O": "owner", "F": "front_desk", "S": "staff"}[r] for r in denied) + " → `FORBIDDEN`")
            tests.append("  - ข้อมูลของ organization อื่น → `NOT_FOUND`")
        if e["auth"] == "customer": tests.append("  - ข้อมูลของลูกค้าคนอื่น/ร้านอื่น → `NOT_FOUND`")
        if e["transition"]: tests.append(f"  - state: `{e['transition']}` + insert booking_event (ถ้าเป็น booking/child) + สถานะต้นทางผิด → `INVALID_TRANSITION`")
        if e["audit"]: tests.append(f"  - audit_log action `{e['audit'].split(' ')[0]}` ถูกเขียนใน transaction เดียวกัน")
        if e["notify"]: tests.append(f"  - notification outbox: `{e['notify']}` (ตรวจ dedupe_key)")
        for x in e["effects"][:6]: tests.append(f"  - effect: {x}")
        if items[0][2]: steps.append(f"ขอบเขต {e['key']}: {items[0][2]}")
        done_tests.append(f"pnpm --filter @app/server test -- services/{e['key'].split('.',1)[0]}/{e['key'].split('.',1)[1]}")
        stories += stories_in(e["stories"])
        if e["rules"]: read += [f"docs/spec/04-business-rules.md#{rid}" for rid in re.findall(r"\bR-\d\d\b", e["rules"])]
        if e["transition"]:
            for part in e["transition"].split(";"):
                read.append(f"docs/spec/03-state-machines.md#sm-{part.strip().split(':')[0]}")
        for t_ in sorted(set(m.group(1) for f in e["req"] + e["query"] for m in re.finditer(r"\b([a-z_]+)\.[a-z_0-9]+", f[3] or ""))):
            read.append(f"docs/spec/02-data-model.md#tbl-{t_}")
        deps += ep_deps(e)
        if rf in route_owner and route_owner[rf] != tkey: deps.append(route_owner[rf])
        route_owner.setdefault(rf, tkey)
        # DTOs
        for dn in dto_closure(dto_refs(e["res"])):
            if dn not in DTO_OWNER:
                DTO_OWNER[dn] = tkey; allowed.append(dto_file(dn)); deliver.append(f"`{dto_file(dn)}`: DTO `{dn}` (05 §2) — task นี้เป็นเจ้าของ")
                read.append(f"docs/spec/05-api.md#dto-{dn}")
            elif DTO_OWNER[dn] != tkey:
                deps.append(DTO_OWNER[dn])
    if suffix and suffix != SPLIT[eps[0]["key"]][0][1]:
        deps.append(f"API-{eps[0]['key']}-{SPLIT[eps[0]['key']][0][1]}")
        # extension phase: route handler is a one-line wrapper written in phase 1 — not touched again
        allowed = [a for a in allowed if not a.startswith("packages/contracts/src/dto/") and a != route_file(eps[0])] + [contract_file(eps[0]), service_file(eps[0]), service_test(eps[0])]
        deps = [d for d in deps if d != route_owner.get(route_file(eps[0])) or d.startswith(f"API-{eps[0]['key']}-")]
        allowed += [f"packages/server/src/services/{eps[0]['key'].split('.')[0]}/{eps[0]['key'].split('.',1)[1]}/**"]
    steps = ["อ่าน endpoint ใน Read first ทีละแถว: request fields, response DTO, errors, state, audit, notify, ผลที่ต้องเกิด"] + steps + [
             "contract (zod) → service (transaction เดียว, tenantDb, domain rules, events/audit/outbox) → route (wrapper บรรทัดเดียว)",
             "เขียน integration test ตามรายการด้านล่างก่อนแล้วค่อย implement"]
    size = max((ep_size(e) for e in eps), key=lambda s: "SML".index(s))
    if len(eps) > 1 and size == "S": size = "M"
    hr = any(e["key"].split(".")[0] in ("auth", "bills", "slips", "refunds", "admin", "liff", "webhook", "customers") and (e["audit"] or e["key"] in COMPLEX) for e in eps) or \
         any(e["key"] in ("bookings.create", "bookings.cancel", "liff.createBooking", "liff.session", "liff.register", "webhook.line", "bills.close", "bills.void", "bills.addPayment") for e in eps)
    task(tkey, title, ms, "api", size, " ".join(stories), allowed=allowed, read=list(dict.fromkeys(read)), deliver=deliver, steps=steps,
         done=list(dict.fromkeys(done_tests)) + [CONF, VERIFY], deps=list(dict.fromkeys(deps)), human_review=hr,
         artifacts={"endpoints": keys, "tests": tests})

for (ms, gkey), items in sorted(API_GROUPS.items(), key=lambda kv: (MSI[kv[0][0]], list(API_GROUPS).index(kv[0]))):
    api_task(ms, gkey, items)

def endpoint_task(key, ms=None):
    """task that implements endpoint (first split if split)"""
    if key in INFRA_OWNED: return INFRA_OWNED[key]
    cands = [t for t in TASKS if t["lane"] == "api" and key in t["artifacts"].get("endpoints", [])]
    if ms is not None:
        ok = [t for t in cands if MSI[t["ms"]] <= MSI[ms]]
        if ok: return ok[-1]["key"]
    return cands[0]["key"]

# ================================================================= jobs & notification templates
for jt, when, payload, handler, dedupe, st in JOBS:
    if jt == "cleanup_uncommitted_files": continue
    ms = ms_of(st)
    rules = re.findall(r"\bR-\d\d\b", handler + when)
    task(f"JOB-{jt}", f"Job handler {jt}", ms, "job", "M", st, allowed=[f"packages/server/src/jobs/handlers/{jt}.ts", f"packages/server/test/jobs/{jt}.test.ts"],
         read=["docs/spec/07-notifications-jobs.md (§2 แถว " + jt + ")"] + [f"docs/spec/04-business-rules.md#{r}" for r in rules],
         steps=[f"ตั้งเมื่อ: {when}", f"handler: {handler}", f"dedupe: `{dedupe}` — idempotent: อ่านสถานะล่าสุดก่อนทำ, จบเงียบถ้าไม่ต้องทำ"],
         done=[f"pnpm --filter @app/server test -- jobs/{jt}", VERIFY], deps=["INF-JOBS", "INF-NOTIFY"] + [f"DOM-{r}" for r in rules if f"DOM-{r}" in BYKEY])
NT_GROUPS = collections.OrderedDict()
for n in NT:
    ms = ms_of(n["stories"])
    if n["key"].startswith("customer.") and MSI[ms] < MSI["M3"]: ms = "M3"
    aud = n["key"].split(".")[0]
    NT_GROUPS.setdefault((ms, aud), []).append(n)
for (ms, aud), ns in NT_GROUPS.items():
    for i in range(0, len(ns), 6):
        chunk = ns[i:i + 6]
        task(f"NTF-{aud}-{ms}-{i // 6}", f"Notification templates ({aud}, {ms}): " + ", ".join(n["key"].split(".", 1)[1] for n in chunk), ms, "notify", "M",
             " ".join(n["stories"] for n in chunk), allowed=[f"packages/server/src/notify/templates/{n['key']}.ts" for n in chunk] + [f"packages/server/test/notify/templates/{n['key']}.test.ts" for n in chunk],
             read=["docs/spec/07-notifications-jobs.md §1"], steps=[f"`{n['key']}`: ช่องทาง {n['channels']}, ตัวแปร {n['variables']}, ข้อความ: {n['text']}" for n in chunk] + [
                 "LINE: Flex Message แบบเรียบ (ข้อความ + ปุ่มลิงก์ LIFF) + altText = บรรทัดแรก; Web Push: title/body/url; email: subject + text",
                 "เงิน/วันที่ในข้อความใช้ R-31"],
             done=["pnpm --filter @app/server test -- notify/templates", VERIFY], deps=["INF-NOTIFY"] + (["INF-LINE"] if any("line" in n["channels"] for n in chunk) else [])
                  + (["INF-WEBPUSH"] if any("web_push" in n["channels"] for n in chunk) else [])
                  + (["INF-EMAIL"] if any("email" in n["channels"] for n in chunk) else []))

# ================================================================= screens
SCREEN_COMP = [("signature", "UI-C-SIGN"), ("กล้อง", "UI-C-UPLOAD"), ("upload", "UI-C-UPLOAD"), ("รูป", "UI-C-UPLOAD"), ("slot", "UI-C-SLOTS"), ("grid ปุ่มเวลา", "UI-C-SLOTS"),
               ("QR", "UI-C-PAY"), ("ตาราง", "UI-C-TABLE"), ("chart", "UI-C-CHART"), ("กราฟ", "UI-C-CHART"), ("money", "UI-C-FORM"), ("date", "UI-C-FORM"), ("tel", "UI-C-FORM")]
SCREEN_SPLIT = {"C-03": [("M2", "grooming", "แท็บกรูมเท่านั้น (ซ่อนแท็บโรงแรม/Daycare)"), ("M5", "hotel+daycare", "เพิ่มแท็บโรงแรม/Daycare/อาบน้ำก่อนกลับ")]}
def screen_endpoint_keys(s):
    keys = list(s["load"])
    for a in s["actions"]:
        keys += [k for k in re.findall(r"\b([a-z][A-Za-z]*\.[a-z][A-Za-z_]*)\b", a[1]) if k in EPK]
    return list(dict.fromkeys(keys))
for s in SCR:
    base_ms = primary_ms(s["stories"])
    if s["app"] == "liff" and MSI[base_ms] < MSI[LIFF_MS]: base_ms = LIFF_MS
    if s["id"] in SCREEN_SPLIT:
        phases = SCREEN_SPLIT[s["id"]]
    else:
        ep_ms_list = sorted({EPK[k] and BYKEY[endpoint_task(k)]["ms"] for k in screen_endpoint_keys(s)}, key=lambda m: MSI[m])
        later = [m for m in ep_ms_list if MSI[m] > MSI[base_ms]]
        first = max([base_ms] + [m for m in ep_ms_list if m not in later][:1], key=lambda m: MSI[m]) if ep_ms_list else base_ms
        phases = [(first, None, None)] + [(m, f"ext-{m}", "เพิ่มส่วนที่ใช้ endpoint ของ " + m) for m in later if m != first]
    blob = json.dumps(s, ensure_ascii=False)
    comps = sorted({c for kw, c in SCREEN_COMP if kw in blob})
    shell = {"console": "UI-SHELL-console", "staff": "UI-SHELL-staff", "liff": "UI-SHELL-liff", "admin": "UI-SHELL-admin"}.get(s["app"], "INF-I18N")
    prev = None
    for ms, suf, note in phases:
        allowed_eps = [k for k in screen_endpoint_keys(s) if MSI[BYKEY[endpoint_task(k)]["ms"]] <= MSI[ms]]
        if suf and suf.startswith("ext-"):
            new_eps = [k for k in allowed_eps if BYKEY[endpoint_task(k)]["ms"] == ms]
        else:
            new_eps = allowed_eps
        tkey = f"SCR-{s['id']}" + (f"-{suf}" if suf else "")
        n_fields = sum(len(f) for _, f in s["sections"])
        size = "L" if n_fields + 2 * len(s["actions"]) > 30 else ("M" if n_fields + 2 * len(s["actions"]) > 12 else "S")
        slug = s["id"].lower()
        allowed = page_files(s) + [f"apps/web/src/components/{slug}/**", f"apps/web/src/i18n/messages/th/{s['id']}.json", f"apps/web/test/screens/{slug}.test.tsx"]
        steps = [f"หน้าจอ {s['id']} {s['title']}: {s['purpose']}",
                 "สร้างทุก section/field ตามตาราง 06 ครบทุกแถว: โหมด (แสดง/กรอก/แก้), แหล่งข้อมูล table.column → ฟิลด์ใน DTO ของ endpoint ที่โหลด, UI/รูปแบบ, กติกา",
                 "ปุ่ม: แสดงตามเงื่อนไข 'แสดงเมื่อ' และทำตาม 'หลังสำเร็จ'", "ข้อความไทยใน messages/th/" + s["id"] + ".json; ป้าย enum ผ่าน enumLabel()",
                 "component test: render ด้วย mock API (msw หรือ mock ของ api.ts) — ตรวจว่าทุกป้ายฟิลด์ในตาราง 06 ปรากฏ และปุ่มเรียก endpoint ที่ถูกต้อง"]
        if note: steps.insert(1, f"ขอบเขตรอบนี้: {note}")
        if suf and suf.startswith("ext-"): steps.insert(1, "เพิ่มเฉพาะส่วน/ปุ่มที่ใช้ endpoint: " + ", ".join(new_eps))
        else:
            hidden = [k for k in screen_endpoint_keys(s) if k not in allowed_eps]
            if hidden: steps.insert(1, "ยังไม่ทำส่วน/ปุ่มที่ใช้ endpoint ต่อไปนี้ (มี task ต่อยอดภายหลัง): " + ", ".join(hidden))
        deps = [shell] + comps + [endpoint_task(k, ms) for k in new_eps] + ([prev] if prev else [])
        task(tkey, f"Screen {s['id']} {s['title']}" + (f" ({suf})" if suf else ""), ms, "ui", size, s["stories"], allowed=allowed,
             read=[f"docs/spec/06-screens.md#scr-{s['id']}"] + [f"docs/spec/05-api.md#ep-{k}" for k in new_eps],
             steps=steps, done=["pnpm --filter @app/web test -- screens/" + slug, CONF, VERIFY], deps=list(dict.fromkeys(deps)),
             artifacts={"screen": s["id"], "endpoints": new_eps})
        prev = tkey

# ================================================================= E2E
E2E = [
 ("M2", "e2e-grooming-backoffice", "หน้าร้านลงนัด → เช็คอิน + ใบยินยอม → ช่างเริ่ม/เสร็จ + รูป → แจ้งรับ", ["SCR-C-03-grooming", "SCR-C-02", "SCR-C-02D", "SCR-C-06", "SCR-S-02", "SCR-S-01"]),
 ("M3", "e2e-liff-booking", "ลูกค้าเปิด LIFF (fake LINE) → ลงทะเบียน → จองกรูมมีมัดจำ → ส่งสลิป → ร้านยืนยัน → เลื่อน/ยกเลิก → job เตือน 24 ชม.", ["SCR-L-01", "SCR-L-04", "SCR-L-07", "SCR-L-09", "SCR-C-07", "JOB-reminder_24h", "JOB-expire_hold"]),
 ("M4", "e2e-billing", "เปิดบิลจากนัด → ส่วนลด → ใช้แพ็กเกจ/เครดิต → รับเงินสด+QR → ปิดบิล → ใบเสร็จ → report card + ดาว → void บิล", ["SCR-C-18", "SCR-C-20", "SCR-S-03", "SCR-L-11"]),
 ("M5", "e2e-hotel", "จอง Hotel ใน LIFF → ฟอร์มรับฝาก + ข้อตกลง → เช็คอิน (vaccine gate) → งานดูแล → อัปเดตรูป → เช็คเอาท์ → บิล", ["SCR-L-05", "SCR-C-15", "SCR-S-04", "SCR-S-05", "SCR-L-10", "SCR-C-13"]),
 ("M6", "e2e-reports", "Dashboard + รายงานยอดขาย/ค่ามือ/occupancy ตรงกับข้อมูล seed + export CSV", ["SCR-C-01", "SCR-C-23", "SCR-C-24", "SCR-C-25"]),
]
for ms, name, flow, deps in E2E:
    task(f"E2E-{ms}", f"E2E {ms}: {flow.split(' → ')[0]} …", ms, "e2e", "L", "", allowed=[f"apps/web/e2e/{name}.spec.ts", f"apps/web/e2e/fixtures/{name}/**"],
         read=["docs/spec/06-screens.md", "docs/spec/03-state-machines.md"], steps=[f"flow: {flow}", "ใช้ dev seed + LINE_FAKE=1; เวลาใช้ clock ของ Playwright", "assert ค่าเงิน/สถานะบนหน้าจอและผ่าน API"],
         done=[f"pnpm --filter @app/web exec playwright test e2e/{name}.spec.ts", VERIFY], deps=["INF-E2E"] + deps)

# ================================================================= dependency fixups & ordering
for t in TASKS:
    if t["key"].startswith("H-GATE-"):
        m = t["key"].split("-")[-1]
        t["deps"] += [x["key"] for x in TASKS if x["ms"] == m and x["owner"] == "agent"]
        prevm = MS[MSI[m] - 1] if MSI[m] > 0 else None
        if prevm: t["deps"].append(f"H-GATE-{prevm}")
for t in TASKS:
    if t["owner"] == "agent" and t["ms"] != "M0":
        prevm = MS[MSI[t["ms"]] - 1]
        if t["lane"] == "e2e" or t["lane"] == "ui": pass
    for d in t["deps"]:
        assert d in BYKEY, f"{t['key']} depends on unknown {d}"
# foundations (domain rules, infra, shared UI components, app shells) are pulled forward to the earliest milestone that needs them
def is_foundation(t): return t["lane"] in ("domain", "infra") or t["key"].startswith(("UI-C-", "UI-SHELL-"))
changed = True
while changed:
    changed = False
    for t in TASKS:
        for d in t["deps"]:
            dt = BYKEY[d]
            if is_foundation(dt) and MSI[dt["ms"]] > MSI[t["ms"]]:
                dt["notes"].append(f"ดึงมาทำใน {t['ms']} (เดิม {dt['ms']}) เพราะ {t['key']} ต้องใช้")
                dt["ms"] = t["ms"]; changed = True
# milestone sanity: a task may not depend on a later-milestone task → bump task to max(dep ms)
changed = True
while changed:
    changed = False
    for t in TASKS:
        for d in t["deps"]:
            if MSI[BYKEY[d]["ms"]] > MSI[t["ms"]]:
                t["notes"].append(f"เลื่อนจาก {t['ms']} → {BYKEY[d]['ms']} เพราะต้องรอ {d}")
                t["ms"] = BYKEY[d]["ms"]; changed = True

# topological order within milestones
LANE_ORDER = {"human": 0, "infra": 1, "domain": 2, "api": 3, "job": 4, "notify": 5, "ui": 6, "e2e": 7}
order, seen, temp = [], set(), set()
def visit(k):
    if k in seen: return
    assert k not in temp, f"cycle at {k}"
    temp.add(k)
    for d in sorted(BYKEY[k]["deps"], key=lambda x: (MSI[BYKEY[x]["ms"]], LANE_ORDER[BYKEY[x]["lane"]])): visit(d)
    temp.discard(k); seen.add(k); order.append(k)
for t in sorted(TASKS, key=lambda t: (MSI[t["ms"]], 1 if t["key"].startswith("H-GATE") else 0, LANE_ORDER[t["lane"]], TASKS.index(t))):
    visit(t["key"])
# stable re-order: by milestone then topo position
pos = {k: i for i, k in enumerate(order)}
order.sort(key=lambda k: (MSI[BYKEY[k]["ms"]], 1 if k.startswith("H-GATE") else 0, pos[k]))
# verify deps precede
idx = {k: i for i, k in enumerate(order)}
for k in order:
    for d in BYKEY[k]["deps"]: assert idx[d] < idx[k], (k, d)

# assign IDs
# Stable IDs: task_ids.json (committed) maps task key → ID forever. New keys get the next free number;
# removed keys are kept as "retired" so an ID is never reused (branches/PRs/commits keep pointing at the same work).
REG_PATH = HERE / "task_ids.json"
REG = json.load(open(REG_PATH, encoding="utf-8")) if REG_PATH.exists() else {"ids": {}, "retired": {}}
ID = {}
n_ag = max([int(v[2:]) for v in list(REG["ids"].values()) + list(REG["retired"].values()) if v.startswith("T-")] or [0])
n_h = max([int(v[2:]) for v in list(REG["ids"].values()) + list(REG["retired"].values()) if v.startswith("H-")] or [0])
for k in order:
    if k in REG["ids"]:
        ID[k] = REG["ids"][k]; continue
    if BYKEY[k]["owner"] == "human":
        n_h += 1; ID[k] = f"H-{n_h:02d}"
    else:
        n_ag += 1; ID[k] = f"T-{n_ag:04d}"
for k, v in list(REG["ids"].items()):
    if k not in BYKEY: REG["retired"][k] = v
REG["ids"] = {k: ID[k] for k in order}
if os.environ.get("TASK_IDS_READONLY") != "1":
    json.dump(REG, open(REG_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
# waves (parallel levels) within milestone
wave = {}
for k in order:
    t = BYKEY[k]
    same = [wave[d] for d in t["deps"] if BYKEY[d]["ms"] == t["ms"]]
    wave[k] = (max(same) + 1) if same else 1

# ================================================================= validation
errors = []
covered_eps = {k for t in TASKS for k in t["artifacts"].get("endpoints", [])} | set(INFRA_OWNED)
for e in EP:
    if e["key"] not in covered_eps: errors.append(f"endpoint {e['key']} not covered by a task")
covered_scr = {t["artifacts"].get("screen") for t in TASKS}
for s in SCR:
    if s["id"] not in covered_scr: errors.append(f"screen {s['id']} not covered")
for r in RS.RULES:
    if r["id"] != "R-27" and f"DOM-{r['id']}" not in BYKEY: errors.append(f"rule {r['id']} not covered")
covered_st = {s for t in TASKS for s in t["stories"]}
missing_st = sorted(set(STORY) - covered_st)
if missing_st: errors.append(f"stories without any task: {missing_st}")
# parallel-safety: shared allowed paths must be ordered by dependency
anc = {}
def ancestors(k):
    if k in anc: return anc[k]
    a = set()
    for d in BYKEY[k]["deps"]: a |= {d} | ancestors(d)
    anc[k] = a; return a
path_users = collections.defaultdict(list)
for t in TASKS:
    for p in t["allowed"]:
        if p in ("pnpm-lock.yaml",) or p.endswith("package.json"): continue
        path_users[p].append(t["key"])
conflicts = []
for p, users in path_users.items():
    for i in range(len(users)):
        for j in range(i + 1, len(users)):
            a, b = users[i], users[j]
            if a not in ancestors(b) and b not in ancestors(a): conflicts.append((p, a, b))
# anchors exist
SPEC = f"{OUT}/docs/spec"
anchor_src = {f: open(f"{SPEC}/{f}", encoding="utf-8").read() for f in os.listdir(SPEC) if f.endswith(".md")}
for t in TASKS:
    for r in t["read"]:
        m = re.match(r"docs/spec/([\w\-.]+\.md)#([\w\-.]+)$", r)
        if m:
            f, a = m.groups()
            if f not in anchor_src or f'id="{a}"' not in anchor_src[f]: errors.append(f"{t['key']}: missing anchor {r}")
print(f"tasks: {len(TASKS)} (agent {n_ag}, human {n_h})")
print("by milestone:", dict(collections.Counter(BYKEY[k]["ms"] for k in order)))
print("by lane:", dict(collections.Counter(t["lane"] for t in TASKS)))
print("by size:", dict(collections.Counter(t["size"] for t in TASKS if t["owner"] == "agent")))
print("parallel path conflicts:", len(conflicts))
for c in conflicts[:30]: print("  ", c)
if errors:
    print("\n".join(errors[:80])); sys.exit(1)
if conflicts: sys.exit(1)

# ================================================================= render cards
def L(lst): return "\n".join(lst)
SCRK = {s["id"]: s for s in SCR}
MODE_TH = {"R": "แสดง", "W": "กรอก", "E": "แสดง+แก้", "F": "ตัวกรอง"}
def _md(x): return str(x or "").replace("|", "\\|").replace("\n", " ")
def ep_contract_md(e):
    out = [f"**`{e['key']}`** — `{e['method']} {e['path']}` · สิทธิ์ `{e['auth']}`" + (f" roles `{e['roles']}`" if e["roles"] else "")]
    for title_, rows in (("Query", e["query"]), ("Request body", e["req"])):
        if rows:
            out += ["", f"{title_}:", "", "| field | type | req | maps to | validation |", "|---|---|---|---|---|"]
            out += [f"| `{n}` | {_md(ty)} | {'✓' if r else ''} | {_md(src)} | {_md(v)} |" for n, ty, r, src, v in rows]
    out += ["", f"Response: `{_md(e['res'])}`" + (" — ดูฟิลด์ DTO ที่ anchor `dto-<Name>` ใน 05" if e["res"] and e["res"][0].isupper() else "")]
    if e["errors"]: out.append(f"Errors: {', '.join('`' + x.strip() + '`' for x in e['errors'].split(',') if x.strip())}")
    if e["transition"]: out.append(f"State: `{e['transition']}`")
    if e["audit"]: out.append(f"Audit: `{e['audit']}`")
    if e["notify"]: out.append(f"Notify: `{e['notify']}`")
    if e["effects"]: out += ["ผลที่ต้องเกิด:"] + [f"- {x}" for x in e["effects"]]
    return out
def screen_fields_md(s, eps, is_ext):
    out = []
    if not is_ext:
        out += ["## Fields (คัดจาก 06 — ต้องมีครบทุกแถว ห้ามเพิ่มฟิลด์ที่ไม่มีในตาราง)", "",
                f"Route `{s['route']}` · สิทธิ์ `{s['roles']}` · โหลดข้อมูล: {', '.join('`' + k + '`' for k in s['load']) or '—'}", ""]
        for sec, fields in s["sections"]:
            out += [f"**{sec}**", "", "| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |", "|---|---|---|---|---|"]
            out += [f"| {MODE_TH[m]} | {_md(lb)} | `{_md(src)}` | {_md(ui)} | {_md(rule)} |" for m, lb, src, ui, rule in fields] + [""]
    acts = [a for a in s["actions"] if not is_ext or any(k in a[1] for k in eps)]
    if acts:
        out += ["## ปุ่ม/การกระทำ" + (" (เฉพาะรอบนี้)" if is_ext else ""), "", "| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |", "|---|---|---|---|"]
        out += [f"| {_md(a[0])} | `{_md(a[1])}` | {_md(a[2])} | {_md(a[3])} |" for a in acts] + [""]
    if s["notes"] and not is_ext: out += ["หมายเหตุหน้าจอ:"] + [f"- {n}" for n in s["notes"]] + [""]
    return out
for k in order:
    t = BYKEY[k]
    tid = ID[k]
    deps = [ID[d] for d in t["deps"]]
    fm = ["---", f"id: {tid}", f"key: {k}", f'title: "{t["title"]}"', f"milestone: {t['ms']}", f"lane: {t['lane']}", f"size: {t['size']}",
          f"owner: {t['owner']}", f"wave: {wave[k]}", f"stories: [{', '.join(t['stories'])}]", f"depends_on: [{', '.join(deps)}]",
          f"human_review: {'true' if t['human_review'] else 'false'}"]
    if t["owner"] == "agent":
        fm.append("allowed_paths:")
        fm += [f'  - "{p}"' for p in t["allowed"]]
    fm.append("---")
    body = [f"# {tid} · {t['title']}", ""]
    body += [f"**Milestone** {t['ms']} · **Lane** {t['lane']} · **Size** {t['size']} · **Wave** {wave[k]} (ทำพร้อมกันได้กับ task wave เดียวกันใน milestone นี้)  ",
             f"**Stories** {', '.join(t['stories']) or '—'} · **Depends on** {', '.join(deps) or '—'}" + (" · ⚠️ **ต้องมีมนุษย์ review ก่อน merge**" if t["human_review"] else ""), ""]
    if t["owner"] == "human":
        body += ["## สิ่งที่ต้องทำ (มนุษย์)", ""] + [f"{i}. {s}" for i, s in enumerate(t["steps"], 1)]
    else:
        if t["read"]:
            body += ["## Read first (ค้นหา anchor `id=\"…\"` ในไฟล์ แล้วอ่านเฉพาะ section นั้น)", ""] + [f"- `{r}`" for r in t["read"]] + [""]
        if t["deliver"]:
            body += ["## Deliverables", ""] + [f"- {d}" for d in t["deliver"]] + [""]
        body += ["## Steps", ""] + [f"{i}. {s}" for i, s in enumerate(t["steps"], 1)] + [""]
        if t["lane"] == "api" and t["artifacts"].get("endpoints"):
            body += ["## Contract (คัดจาก 05 — ชื่อฟิลด์/ชนิด/บังคับ ต้องตรงทุกตัว)", ""]
            for k_ in t["artifacts"]["endpoints"]:
                body += ep_contract_md(EPK[k_]) + [""]
        if t["lane"] == "ui" and t["artifacts"].get("screen"):
            body += screen_fields_md(SCRK[t["artifacts"]["screen"]], t["artifacts"].get("endpoints", []), t["key"].split("-ext-")[0] != t["key"])
        if t["artifacts"].get("tests"):
            body += ["## Test cases ที่ต้องมี (integration, PGlite)", ""] + t["artifacts"]["tests"] + [""]
        body += ["## Allowed paths (CI บังคับ)", ""] + [f"- `{p}`" for p in t["allowed"]] + ["- `docs/questions.md`, การ์ดนี้ (Status log)", ""]
        body += ["## Out of scope", "", "- ไฟล์/พฤติกรรมนอกเหนือ Deliverables และ Steps — ถ้าจำเป็นให้เขียน docs/questions.md", ""]
        body += ["## Done when", ""] + [f"- `{d}`" for d in t["done"]] + [""]
    if t["notes"]:
        body += ["## Notes", ""] + [f"- {n}" for n in t["notes"]] + [""]
    body += ["## Status log", "", "<!-- agent: YYYY-MM-DD · สิ่งที่ทำ · คำถามที่เปิด (Q-xxxx) -->", ""]
    with open(f"{TASKDIR}/{tid}.md", "w", encoding="utf-8") as f:
        f.write("\n".join(fm) + "\n\n" + "\n".join(body))

# ================================================================= index + csv
rows = []
for k in order:
    t = BYKEY[k]
    rows.append({"id": ID[k], "key": k, "milestone": t["ms"], "wave": wave[k], "lane": t["lane"], "owner": t["owner"], "size": t["size"],
                 "human_review": "yes" if t["human_review"] else "", "title": t["title"], "stories": " ".join(t["stories"]),
                 "depends_on": " ".join(ID[d] for d in t["deps"]), "allowed_paths": len(t["allowed"])})
with open(f"{TASKDIR}/tasks.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
idx_md = ["# Task Index (generated — ห้ามแก้มือ)", "", "> สร้างจาก `tools/spec-src/build_tasks.py` · การ์ดแต่ละใบ: `docs/tasks/<ID>.md` · **ห้ามเริ่ม task ที่ depends_on ยังไม่ merge**", ""]
for m in MS:
    ks = [k for k in order if BYKEY[k]["ms"] == m]
    if not ks: continue
    idx_md += [f"## {m} — {next((x['name'] for x in ST['milestones'] if x['id'] == m), '')} ({len(ks)} tasks)", "",
               "| ID | wave | lane | size | review | title | depends on |", "|---|---|---|---|---|---|---|"]
    for k in ks:
        t = BYKEY[k]
        idx_md.append(f"| [{ID[k]}]({ID[k]}.md) | {wave[k]} | {t['lane']} | {t['size']} | {'⚠️' if t['human_review'] else ''} | {t['title'].replace('|', '/')} | {' '.join(ID[d] for d in t['deps'][:8])}{' …' if len(t['deps']) > 8 else ''} |")
    idx_md.append("")
with open(f"{TASKDIR}/README.md", "w", encoding="utf-8") as f: f.write("\n".join(idx_md) + "\n")
json.dump({"order": [ID[k] for k in order], "tasks": {ID[k]: {"key": k, "ms": BYKEY[k]["ms"], "lane": BYKEY[k]["lane"], "size": BYKEY[k]["size"], "owner": BYKEY[k]["owner"],
           "wave": wave[k], "deps": [ID[d] for d in BYKEY[k]["deps"]], "title": BYKEY[k]["title"], "human_review": BYKEY[k]["human_review"]} for k in order}},
          open(f"{TASKDIR}/tasks.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("written", len(order), "cards to", TASKDIR)
