# -*- coding: utf-8 -*-
import json, os, re, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model as M
import rules_spec as RS
from api_errors_dtos import ERRORS, DTOS
from api_endpoints import EP
from states_spec import SM
from notify_spec import NT, JOBS
from screens_spec import SCR, ENUM_LABELS
import stories as ST

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(HERE, "..", ".."))
SPEC = f"{OUT}/docs/spec"
os.makedirs(f"{SPEC}/vectors", exist_ok=True)

# ------------------------------------------------------------ model index
def all_cols(t):
    cols = [c[0] for c in t["cols"]]
    if t["pk"] == "id": cols.insert(0, "id")
    cols.append("created_at")
    if t["updated"]: cols.append("updated_at")
    return cols
TABLES = {t["name"]: set(all_cols(t)) for t in M.T}
COLTYPE = {}
for t in M.T:
    for c in t["cols"]:
        COLTYPE[f"{t['name']}.{c[0]}"] = c[1]
STORY_IDS = {s["id"]: s for s in ST.S}
RULE_IDS = {r["id"] for r in RS.RULES}
ERR = {e[0]: e for e in ERRORS}
EPK = {e["key"]: e for e in EP}
NTK = {n["key"]: n for n in NT}
JOBK = {j[0] for j in JOBS}

errors, warnings = [], []
REF_RE = re.compile(r"\b([a-z][a-z_]*)\.([a-z][a-z0-9_]*)\b")
IGNORE_REF = {("line", "me"), ("liff", "line"), ("window", "print"), ("bill", "discount"), ("bill", "close"), ("bill", "void"), ("payment", "create"),
              ("payment", "void"), ("booking", "cancel"), ("booking", "no_show"), ("booking", "price_override"), ("customer", "blacklist"),
              ("customer", "reliability_override"), ("stay", "vaccine_override"), ("staff", "invite"), ("staff", "role_change"), ("staff", "disable"),
              ("policy", "update"), ("promptpay", "update"), ("line_channel", "update"), ("commission_rule", "update"), ("data", "export"),
              ("pdpa", "erase"), ("support", "session_start"), ("support", "session_end"), ("import", "commit"), ("deposit", "waive"),
              ("refund", "create"), ("credit", "adjust"), ("slip", "verify"), ("slip", "reject")}

def check_refs(text, where, strict=False):
    if not text: return
    for m in REF_RE.finditer(str(text)):
        t, c = m.group(1), m.group(2)
        if (t, c) in IGNORE_REF: continue
        if t in TABLES:
            if c not in TABLES[t]:
                errors.append(f"{where}: unknown column {t}.{c}")
        elif strict:
            errors.append(f"{where}: unknown table in '{t}.{c}'")

def check_rules(text, where):
    for rid in re.findall(r"\bR-\d\d\b", str(text)):
        if rid not in RULE_IDS:
            errors.append(f"{where}: unknown rule {rid}")

def check_stories(text, where):
    for sid in re.findall(r"US-\d\d-\d\d", str(text)):
        if sid not in STORY_IDS:
            errors.append(f"{where}: unknown story {sid}")
    for rng in re.findall(r"US-(\d\d)-(\d\d)\.\.(\d\d)", str(text)):
        pass

def expand_stories(text):
    out = set(re.findall(r"US-\d\d-\d\d", str(text)))
    for ep_, a, b in re.findall(r"US-(\d\d)-(\d\d)\.\.(\d\d)", str(text)):
        for i in range(int(a), int(b) + 1):
            out.add(f"US-{ep_}-{i:02d}")
    return out

# ------------------------------------------------------------ DTOs
DTO_NAME_RE = re.compile(r"\b([A-Z][A-Za-z]+)\b")
for name, d in DTOS.items():
    for fname, src in d["fields"]:
        where = f"DTO {name}.{fname}"
        if src.startswith("dto:") or src.startswith("[]dto:"):
            ref = src.split(":", 1)[1]
            if ref not in DTOS: errors.append(f"{where}: unknown DTO {ref}")
        elif src.startswith("calc"):
            check_refs(src, where); check_rules(src, where)
        else:
            if not REF_RE.fullmatch(src): errors.append(f"{where}: source must be table.column, calc:, dto: — got '{src}'")
            check_refs(src, where, strict=True)

def dto_refs_in(text):
    return [w for w in DTO_NAME_RE.findall(str(text)) if w in DTOS or (w[0].isupper() and any(ch.islower() for ch in w) and w.endswith(("Item", "Detail", "List", "Card", "Report")))]

# ------------------------------------------------------------ endpoints
seen_paths = set()
for e in EP:
    where = f"EP {e['key']}"
    mp = (e["method"], e["path"])
    if mp in seen_paths: errors.append(f"{where}: duplicate {mp}")
    seen_paths.add(mp)
    if e["auth"] == "staff" and not e["roles"]: errors.append(f"{where}: staff endpoint without roles")
    if e["auth"] == "staff" and set(e["roles"]) - set("OFS"): errors.append(f"{where}: bad roles {e['roles']}")
    for f in e["req"] + e["query"]:
        name, typ, req_, src, val = f
        if src and not src.startswith("calc"):
            if not REF_RE.fullmatch(src): errors.append(f"{where}.{name}: bad source '{src}'")
            check_refs(src, f"{where}.{name}", strict=True)
        check_refs(val, f"{where}.{name}"); check_rules(val, f"{where}.{name}")
        if typ.startswith("enum:") or typ.startswith("enum[]:"):
            en = typ.split(":", 1)[1]
            if en not in M.ENUMS: errors.append(f"{where}.{name}: unknown enum {en}")
    for w in dto_refs_in(e["res"]):
        if w not in DTOS: errors.append(f"{where}: response references unknown DTO {w}")
    for code in [c.strip() for c in e["errors"].split(",") if c.strip()]:
        if code not in ERR: errors.append(f"{where}: unknown error {code}")
    check_rules(e["rules"], where)
    for x in e["effects"]: check_refs(x, where); check_rules(x, where)
    check_stories(e["stories"], where)
    for k in re.split(r"[,|]", e["notify"]):
        k = k.strip().split(" ")[0]
        if k and k not in NTK: errors.append(f"{where}: unknown notification {k}")
    if e["transition"]:
        for part in e["transition"].split(";"):
            part = part.strip()
            sm_name = part.split(":")[0]
            if sm_name not in SM: errors.append(f"{where}: transition refers to unknown state machine {sm_name}")

# ------------------------------------------------------------ state machines
for name, s in SM.items():
    t, c = s["column"].split(".")
    if t not in TABLES or c not in TABLES[t]: errors.append(f"SM {name}: bad column {s['column']}")
    typ = COLTYPE.get(s["column"], "")
    if typ.startswith("e:"):
        vals = set(M.ENUMS[typ[2:]])
        if set(s["states"]) != vals: errors.append(f"SM {name}: states {sorted(s['states'])} != enum {sorted(vals)}")
    for frm, to, trig, guard, eff in s["transitions"]:
        for st in re.split(r"[|]", frm) + re.split(r"[|]", to):
            st = st.strip()
            if st not in s["states"] and st not in ("∅", "*"): errors.append(f"SM {name}: unknown state '{st}'")
        for tr in re.split(r"\s*\|\s*", trig):
            tr = tr.strip().split(" ")[0]
            if tr.startswith("job:"):
                if tr[4:] not in JOBK: errors.append(f"SM {name}: unknown job {tr}")
            elif tr.startswith("system:"):
                pass
            elif tr not in EPK:
                errors.append(f"SM {name}: unknown trigger endpoint {tr}")
        check_rules(guard + eff, f"SM {name}"); check_refs(guard + " " + eff, f"SM {name}")

# ------------------------------------------------------------ notifications / jobs
for n in NT:
    check_stories(n["stories"], f"NT {n['key']}"); check_rules(n["trigger"], f"NT {n['key']}")
    if n["cls"] not in ("essential", "helpful", "marketing", "-"): errors.append(f"NT {n['key']}: bad class")
for j in JOBS:
    if j[0] not in M.ENUMS["job_type"]: errors.append(f"JOB {j[0]} not in enum job_type")
    check_stories(j[5], f"JOB {j[0]}"); check_rules(j[3], f"JOB {j[0]}")
missing_jobs = set(M.ENUMS["job_type"]) - JOBK
if missing_jobs: errors.append(f"job_type enum values without catalog entry: {missing_jobs}")

# ------------------------------------------------------------ screens
KEY_RE = re.compile(r"\b([a-z][A-Za-z]*\.[a-z][A-Za-z_]*)\b")
used_eps = set()
for s in SCR:
    where = f"SCR {s['id']}"
    check_stories(s["stories"], where)
    for k in s["load"]:
        if k not in EPK: errors.append(f"{where}: unknown load endpoint {k}")
        used_eps.add(k)
    for sec, fields in s["sections"]:
        for mode, label, src, ui, rule in fields:
            fw = f"{where}/{sec}/{label}"
            if mode not in "RWEF": errors.append(f"{fw}: bad mode")
            if src.startswith("calc"):
                check_refs(src, fw); check_rules(src, fw)
            else:
                if not REF_RE.fullmatch(src): errors.append(f"{fw}: source must be table.column or calc: — got '{src}'")
                check_refs(src, fw, strict=True)
            check_refs(ui, fw); check_refs(rule, fw); check_rules(rule + " " + ui, fw)
    for label, keys, when, after in s["actions"]:
        for k in KEY_RE.findall(keys):
            if k in EPK: used_eps.add(k)
            else: errors.append(f"{where} action '{label}': unknown endpoint {k}")
        check_refs(when + " " + after, where)

# ------------------------------------------------------------ routes: absolute paths + Next.js dynamic-segment names consistent
def page_paths(route):
    return [r.strip().split("?")[0].strip() for r in route.split("|") if r.strip().startswith("/")]
APP_PREFIX = {"console": "/console", "staff": "/staff", "liff": "/liff/", "admin": "/admin"}
all_paths = [e["path"].replace("{", "[").replace("}", "]") for e in EP]
for s in SCR:
    if "," in s["route"]: errors.append(f"SCR {s['id']}: route uses ',' — list alternatives with ' | ' and full paths")
    for p in page_paths(s["route"]):
        if s["app"] in APP_PREFIX and not p.startswith(APP_PREFIX[s["app"]]): errors.append(f"SCR {s['id']}: route {p} must start with {APP_PREFIX[s['app']]}")
        all_paths.append(p)
dyn = collections.defaultdict(set)
for p in all_paths:
    segs = [x for x in p.split("/") if x]
    for i, seg in enumerate(segs):
        if seg.startswith("["): dyn["/" + "/".join(segs[:i])].add(seg)
for parent, names in dyn.items():
    if len(names) > 1: errors.append(f"route params conflict under {parent}: {sorted(names)} (Next.js needs one name per level)")

# ------------------------------------------------------------ enum labels
for en, labels in ENUM_LABELS.items():
    if en not in M.ENUMS: errors.append(f"ENUM_LABELS: unknown enum {en}"); continue
    if set(labels) != set(M.ENUMS[en]): errors.append(f"ENUM_LABELS {en}: keys {sorted(labels)} != {sorted(M.ENUMS[en])}")

# ------------------------------------------------------------ rules: compute vectors
vec_count = 0
for r in RS.RULES:
    check_stories(r["stories"], r["id"])
    for v in r["vectors"]:
        cases = []
        names = set()
        for name, inp in v["cases"]:
            if name in names: errors.append(f"{r['id']} {v['export']}: duplicate case {name}")
            names.add(name)
            cases.append({"name": name, "input": inp, "expected": v["fn"](inp)})
        doc = {"rule": r["id"], "export": v["export"], "module": r["file"],
               "note": "Generated from the reference implementation. DO NOT EDIT — change requires human approval (label spec-change).",
               "cases": cases}
        with open(f"{SPEC}/vectors/{r['id']}.{v['export']}.json", "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        v["_cases"] = cases
        vec_count += len(cases)

# ------------------------------------------------------------ coverage
cover = collections.defaultdict(lambda: collections.defaultdict(list))
for s in SCR:
    for sid in expand_stories(s["stories"]): cover[sid]["screens"].append(s["id"])
for e in EP:
    for sid in expand_stories(e["stories"]): cover[sid]["api"].append(e["key"])
for r in RS.RULES:
    for sid in expand_stories(r["stories"]): cover[sid]["rules"].append(r["id"])
for n in NT:
    for sid in expand_stories(n["stories"]): cover[sid]["notify"].append(n["key"])
for j in JOBS:
    for sid in expand_stories(j[5]): cover[sid]["jobs"].append(j[0])
for t in M.T:
    for sid in expand_stories(t["stories"]): cover[sid]["tables"].append(t["name"])
uncovered = [sid for sid in STORY_IDS if not (cover[sid]["screens"] or cover[sid]["api"] or cover[sid]["rules"])]
no_screen = [sid for sid in STORY_IDS if not cover[sid]["screens"]]
orphan_eps = [e["key"] for e in EP if e["key"] not in used_eps and e["auth"] in ("staff", "customer", "admin")]
table_refs = collections.Counter()
def count_tables(text):
    for m in REF_RE.finditer(str(text)):
        if m.group(1) in TABLES: table_refs[m.group(1)] += 1
for d in DTOS.values():
    for _, src in d["fields"]: count_tables(src)
for e in EP:
    for f in e["req"] + e["query"]: count_tables(f[3])
for s in SCR:
    for _, fields in s["sections"]:
        for fld in fields: count_tables(fld[2])
unref_tables = [t for t in TABLES if table_refs[t] == 0]

print(f"rules {len(RS.RULES)}, vectors {vec_count}, endpoints {len(EP)}, DTOs {len(DTOS)}, errors-catalog {len(ERRORS)}, screens {len(SCR)}, "
      f"state machines {len(SM)}, notifications {len(NT)}, jobs {len(JOBS)}")
print("stories with no screen/api/rule:", uncovered)
print("stories without a screen:", no_screen)
print("endpoints not used by any screen:", orphan_eps)
print("tables never referenced by DTO/API/screen:", unref_tables)
if errors:
    print(f"\n{len(errors)} ERRORS"); print("\n".join(errors[:200])); sys.exit(1)
print("VALIDATION OK")

# ------------------------------------------------------------ render helpers
def md(s): return str(s).replace("|", "\\|").replace("\n", "<br>")
def w(path, text):
    with open(path, "w", encoding="utf-8") as f: f.write(text)
ROLE_NAME = {"O": "owner", "F": "front_desk", "S": "staff"}
def roles_txt(e):
    if e["auth"] == "staff": return ", ".join(ROLE_NAME[c] for c in e["roles"])
    return {"customer": "ลูกค้า (LIFF)", "admin": "platform admin", "public": "ไม่ต้องล็อกอิน", "cron": "cron secret", "line": "LINE signature"}[e["auth"]]

# ------------------------------------------------------------ 03 state machines
L = ["# 03 — State Machines\n", "> ทุกการเปลี่ยนสถานะต้องผ่านฟังก์ชัน `transition()` ของ entity นั้นใน `packages/domain/src/<entity>/state.ts` "
     "ซึ่งมีตาราง allowed transitions ตรงตามไฟล์นี้ (ทดสอบด้วย `docs/spec/vectors/state-machines.json`) — ห้าม `UPDATE status` ตรง ๆ จากที่อื่น\n",
     "> ฝั่ง DB: `UPDATE … SET status = :to WHERE id = :id AND status IN (:from)` → 0 แถว = `INVALID_TRANSITION` (409) และ insert `booking_event` ใน transaction เดียวกันเสมอสำหรับ booking/groom/stay/daycare/deposit\n"]
sm_json = {}
for name, s in SM.items():
    L.append(f"\n<a id=\"sm-{name}\"></a>\n\n## {name} (`{s['column']}`)\n\n{s['desc']}\n")
    L.append("| สถานะ | ความหมาย |\n|---|---|")
    for k, v in s["states"].items(): L.append(f"| `{k}` | {md(v)} |")
    L.append("\n| จาก | ไป | trigger (endpoint / job) | เงื่อนไข (guard) | ผลข้างเคียง |\n|---|---|---|---|---|")
    for frm, to, trig, guard, eff in s["transitions"]:
        L.append(f"| `{frm}` | `{to}` | {md(trig)} | {md(guard)} | {md(eff)} |")
    for n_ in s["notes"]: L.append(f"\n- {n_}")
    sm_json[name] = {"column": s["column"], "states": list(s["states"]),
                     "transitions": [{"from": f.split("|"), "to": t.split("|"), "trigger": tr} for f, t, tr, g, e in s["transitions"]]}
w(f"{SPEC}/03-state-machines.md", "\n".join(L) + "\n")
with open(f"{SPEC}/vectors/state-machines.json", "w", encoding="utf-8") as f:
    json.dump({"note": "Allowed transitions. packages/domain state tables must match exactly. DO NOT EDIT without spec-change approval.", "machines": sm_json},
              f, ensure_ascii=False, indent=2)

# ------------------------------------------------------------ 04 business rules
L = ["# 04 — Business Rules + Test Vectors\n",
     "> **กติกาสำหรับ AI agent:** ฟังก์ชันใน `packages/domain` ต้อง pure (ไม่แตะ DB/เวลา/สุ่ม — รับ `now` เป็น input) และ signature ตรงตามที่เขียนไว้ทุกตัวอักษร",
     "> เทสต์ของแต่ละ rule = วนอ่าน `docs/spec/vectors/<R-xx>.<export>.json` แล้ว `expect(fn(c.input)).toEqual(c.expected)` — **ห้ามแก้ไฟล์ vectors** (CI ปฏิเสธ PR ที่แก้ ถ้าไม่มี label `spec-change` ที่มนุษย์อนุมัติ)",
     "> ถ้าคิดว่า vector ผิด: หยุด, เขียนเหตุผลใน `docs/questions.md`, ไม่ต้องทำให้เทสต์ผ่านด้วยการเลี่ยง\n",
     "## สารบัญ\n", "| Rule | ชื่อ | Module | Exports | Vectors | Stories |", "|---|---|---|---|---|---|"]
for r in RS.RULES:
    exps = ", ".join(f"`{v['export']}`" for v in r["vectors"]) or "—"
    nv = sum(len(v["_cases"]) for v in r["vectors"])
    L.append(f"| [{r['id']}](#{r['id'].lower()}) | {md(r['name'])} | `{r['file']}` | {exps} | {nv} | {r['stories']} |")
for r in RS.RULES:
    L.append(f"\n<a id=\"{r['id']}\"></a>\n\n## {r['id']}\n\n### {r['name']}\n\nStories: {r['stories']} · Module: `{r['file']}`\n\n{r['summary']}\n")
    L.append("```ts\n" + r["ts"] + "\n```\n")
    L.append("**อัลกอริทึม**\n")
    for i, st in enumerate(r["steps"], 1): L.append(f"{i}. {st}")
    if r["notes"]:
        L.append("\n**หมายเหตุ**\n")
        for n_ in r["notes"]: L.append(f"- {n_}")
    for v in r["vectors"]:
        L.append(f"\n**Vectors `{v['export']}`** → `docs/spec/vectors/{r['id']}.{v['export']}.json` ({len(v['_cases'])} cases)\n")
        L.append("| # | case | expected (ย่อ) |\n|---|---|---|")
        for i, c in enumerate(v["_cases"], 1):
            exp = json.dumps(c["expected"], ensure_ascii=False)
            if len(exp) > 140: exp = exp[:137] + "…"
            L.append(f"| {i} | {md(c['name'])} | `{md(exp)}` |")
w(f"{SPEC}/04-business-rules.md", "\n".join(L) + "\n")

# ------------------------------------------------------------ 05 API
L = ["# 05 — API Contract (REST, field-level)\n",
     "## 0. ข้อตกลงร่วม\n",
     "| เรื่อง | ข้อกำหนด |\n|---|---|",
     "| Base path | `/api/v1` — Next.js Route Handlers ใน `apps/web/app/api/v1/**/route.ts` (handler บาง: parse → เรียก service ใน `packages/server` → map error) |",
     "| Namespace = การยืนยันตัวตน | `/api/v1/staff/*` (cookie `sid`, role owner/front_desk/staff), `/api/v1/liff/{branchSlug}/*` (cookie `cid` ลูกค้า), `/api/v1/admin/*` (cookie `aid`), `/api/v1/auth/*` + `/api/v1/public/*` (ไม่ต้องล็อกอิน), `/api/webhooks/*`, `/api/cron/*` |",
     "| Tenant | `organizationId`/`branchId` มาจาก session เท่านั้น — **ห้ามรับจาก body/query**; ทุก query ผ่าน repository ที่บังคับ `where organization_id = ctx.orgId` |",
     "| Validation | zod schema ใน `packages/contracts/src/endpoints/<key>.ts` (1 ไฟล์ต่อ endpoint) ชื่อ `<Key>Request` / `<Key>Query` / `<Key>Response`; DTO ที่ใช้ร่วมอยู่ `packages/contracts/src/dto/<kebab-name>.ts` (key = คอลัมน์ Key ด้านล่าง เช่น `bookings.create` → `BookingsCreateRequest`) ใช้ร่วม client/server |",
     "| JSON | camelCase; เงิน = integer `*Satang`; instant = ISO-8601 UTC (`2026-10-05T03:00:00.000Z`); วันท้องถิ่น = `YYYY-MM-DD`; เวลาในวัน = `HH:MM`; id = uuid |",
     "| Error | `{ \"error\": { \"code\": \"SLOT_TAKEN\", \"message\": \"ข้อความไทย\", \"details\": {…} } }` + HTTP status ตาม §1; field errors → `VALIDATION_FAILED` + `details.fields` |",
     "| Pagination | `?limit=50&cursor=…` (limit ≤ 200) → `{ items: […], nextCursor: string \\| null }` = `Paged<T>` |",
     "| Concurrency | state transition ใช้ conditional UPDATE (03); เงินใช้ `expectedPaidSatang` (R-15) |",
     "| Warnings | response อาจมี `warnings: [{ code, message, data }]` (ไม่ใช่ error) เช่น นัดที่ได้รับผลจากการปิดร้าน |",
     "| Rate limit | auth 10/นาที/IP, LIFF slot search 30/นาที/ผู้ใช้, อื่น ๆ 120/นาที/session (in-memory/DB token bucket — ไม่ใช้บริการเสียเงิน) |",
     "| Role staff | ข้อมูลติดต่อลูกค้า (phone/email/address/internalNote/credit) ถูกตัดจาก response ใน serializer |",
     "| Support mode | session ที่มี `support_access_log_id` → ทุก method ที่ไม่ใช่ GET ตอบ `SUPPORT_READ_ONLY` |\n",
     "## 1. Error codes\n", "| code | HTTP | ข้อความ (th) | เมื่อไร |", "|---|---|---|---|"]
for c, h, m, wh in ERRORS: L.append(f"| `{c}` | {h} | {md(m)} | {md(wh)} |")
L.append("\n## 2. Response DTOs\n\nแต่ละฟิลด์ระบุแหล่งข้อมูล — `table.column` = อ่านตรงจากคอลัมน์ (ชนิด/ความหมายตาม 02), `calc:` = คำนวณ, `dto:` = ซ้อน DTO อื่น\n")
for name, d in DTOS.items():
    L.append(f"\n<a id=\"dto-{name}\"></a>\n\n### {name}\n\n{d['desc']}\n\n| field | source |\n|---|---|")
    for fn_, src in d["fields"]: L.append(f"| `{fn_}` | {md(src)} |")
L.append("\n## 3. Endpoints\n")
groups = collections.OrderedDict()
for e in EP: groups.setdefault(e["key"].split(".")[0], []).append(e)
L.append("| Key | Method | Path | สิทธิ์ | Stories |\n|---|---|---|---|---|")
for e in EP: L.append(f"| [`{e['key']}`](#ep-{e['key']}) | {e['method']} | `{e['path']}` | {roles_txt(e)} | {e['stories']} |")
for g, eps in groups.items():
    L.append(f"\n### กลุ่ม `{g}`\n")
    for e in eps:
        L.append(f"\n<a id=\"ep-{e['key']}\"></a>\n\n#### {e['key']}\n\n**{e['method']} `{e['path']}`** — {e['title']}  \nสิทธิ์: {roles_txt(e)} · Stories: {e['stories']}"
                 + (f" · Rules: {e['rules']}" if e['rules'] else "") + "\n")
        if e["query"]:
            L.append("Query:\n\n| param | type | req | maps to | validation |\n|---|---|---|---|---|")
            for n_, t_, r_, s_, v_ in e["query"]: L.append(f"| `{n_}` | {t_} | {'✓' if r_ else ''} | {md(s_)} | {md(v_)} |")
            L.append("")
        if e["req"]:
            L.append("Request body:\n\n| field | type | req | maps to (table.column) | validation |\n|---|---|---|---|---|")
            for n_, t_, r_, s_, v_ in e["req"]: L.append(f"| `{n_}` | {t_} | {'✓' if r_ else ''} | {md(s_)} | {md(v_)} |")
            L.append("")
        L.append(f"Response: `{md(e['res'])}`" + ("" if e["res"] != "204" else " (No Content)"))
        if e["errors"]: L.append(f"  \nErrors: {', '.join('`'+x.strip()+'`' for x in e['errors'].split(',') if x.strip())}")
        if e["transition"]: L.append(f"  \nState: `{e['transition']}`")
        if e["audit"]: L.append(f"  \nAudit: `{e['audit']}`")
        if e["notify"]: L.append(f"  \nNotify: `{e['notify']}`")
        if e["effects"]:
            L.append("\n\nผลที่ต้องเกิด:")
            for x in e["effects"]: L.append(f"- {x}")
        L.append("")
w(f"{SPEC}/05-api.md", "\n".join(L) + "\n")

# ------------------------------------------------------------ 06 screens
MODE = {"R": "แสดง", "W": "กรอก", "E": "แสดง+แก้", "F": "ตัวกรอง"}
APPS = collections.OrderedDict([("auth", "หน้าเข้าสู่ระบบ"), ("public", "หน้าเว็บสาธารณะ"), ("console", "Console ร้าน (owner / front_desk) — desktop/tablet"),
                                ("staff", "Staff app (PWA มือถือ) — ช่าง/ผู้ดูแล"), ("liff", "LIFF ลูกค้า (ใน LINE)"), ("admin", "Platform admin")])
L = ["# 06 — Screen Specs (field-level: แสดง/กรอก/บันทึกที่ไหน)\n",
     "> ทุกหน้าระบุ: route, สิทธิ์, stories, API ที่โหลด, **ทุกฟิลด์** (โหมด, ป้าย, แหล่งข้อมูล `table.column`, รูปแบบ UI, กติกา) และปุ่ม → endpoint",
     "> โหมด: **แสดง** = read-only · **กรอก** = ช่องใหม่ · **แสดง+แก้** = prefill จากค่าเดิมแล้วแก้ได้ · **ตัวกรอง** = ไม่บันทึก",
     "> รูปแบบ: `money` = R-31 formatTHB · `date` = formatThaiDate (พ.ศ.) · `time` = formatTime · `phone` = R-22 formatPhone · `weight` = formatWeight · `enum` = ป้ายไทยจาก `docs/spec/enum-labels.th.json`",
     "> UI kit: Tailwind + shadcn/ui; ภาษาไทยทั้งหมดผ่าน next-intl (`th`); ทุกหน้าใช้ได้ที่ความกว้าง 360px (LIFF/Staff) และ 1024px (Console)\n",
     "## กติการ่วมทุกหน้า\n",
     "- Loading: skeleton; Error: แสดง `error.message` จาก API + ปุ่มลองใหม่; Empty: ข้อความ + ปุ่ม action หลัก",
     "- ฟอร์ม: validate ด้วย zod schema เดียวกับ API (`packages/contracts`) ก่อนส่ง; แสดง error ใต้ช่อง; ปุ่ม submit disabled ระหว่างส่ง (กันกดซ้ำ)",
     "- ปุ่มที่เปลี่ยนสถานะต้องแสดงตามสถานะปัจจุบันเท่านั้น (ตาม 03) และ refetch หลังสำเร็จ",
     "- ตัวเลขเงินทุกที่มาจาก server — client ห้ามคำนวณยอดเงินเอง (ยกเว้นพรีวิวเงินทอนบนปุ่มลัด)",
     "- รูปทุกใบผ่าน signed URL; อัปโหลดผ่าน `*.uploadUrl` + presigned PUT (R-25)",
     "- ช่องเบอร์ใช้ `inputmode=tel`, เงิน `inputmode=decimal` (รับบาท แปลงเป็นสตางค์ก่อนส่ง), น้ำหนักรับ กก. 1 ตำแหน่ง แปลงเป็นกรัม\n",
     "## สารบัญ\n", "| ID | App | Route | หน้า | สิทธิ์ | Stories |", "|---|---|---|---|---|---|"]
for s in SCR: L.append(f"| [{s['id']}](#scr-{s['id']}) | {s['app']} | `{md(s['route'])}` | {s['title']} | {s['roles']} | {s['stories']} |")
for app, title in APPS.items():
    L.append(f"\n## {title}\n")
    for s in [x for x in SCR if x["app"] == app]:
        L.append(f"\n<a id=\"scr-{s['id']}\"></a>\n\n### {s['id']}\n\n#### {s['title']}\n\nRoute: `{s['route']}` · สิทธิ์: {s['roles']} · Stories: {s['stories']}  \n"
                 f"จุดประสงค์: {s['purpose']}  \nโหลดข้อมูล: {', '.join('`'+k+'`' for k in s['load']) or '—'}\n")
        for sec, fields in s["sections"]:
            L.append(f"**{sec}**\n\n| โหมด | ป้าย | แหล่งข้อมูล / บันทึกที่ | UI / รูปแบบ | กติกา |\n|---|---|---|---|---|")
            for mode, label, src, ui, rule in fields:
                L.append(f"| {MODE[mode]} | {md(label)} | `{md(src)}` | {md(ui)} | {md(rule)} |")
            L.append("")
        if s["actions"]:
            L.append("**ปุ่ม/การกระทำ**\n\n| ปุ่ม | endpoint | แสดงเมื่อ | หลังสำเร็จ |\n|---|---|---|---|")
            for a in s["actions"]: L.append(f"| {md(a[0])} | `{md(a[1])}` | {md(a[2])} | {md(a[3])} |")
            L.append("")
        for n_ in s["notes"]: L.append(f"- {n_}")
w(f"{SPEC}/06-screens.md", "\n".join(L) + "\n")
with open(f"{SPEC}/enum-labels.th.json", "w", encoding="utf-8") as f:
    json.dump({"enum": ENUM_LABELS}, f, ensure_ascii=False, indent=2)

# ------------------------------------------------------------ 07 notifications & jobs
L = ["# 07 — Notifications & Scheduled Jobs\n",
     "> ข้อความทุกชิ้นถูกสร้างเป็นแถว `notification` (status queued) **ใน transaction เดียวกับเหตุการณ์** (outbox) แล้ว dispatcher ส่งหลัง commit + `cron.tick` เก็บตกแถว queued ที่ค้าง > 1 นาที",
     "> ลูกค้า: ผ่าน LINE OA ของร้านเท่านั้น (R-19) และนับโควตาตาม R-18 · พนักงาน: Web Push (VAPID, ฟรี) · อีเมล: เฉพาะ invite/reset/สรุปเจ้าของ (ใช้ SMTP ฟรีโควตา เช่น Gmail SMTP / Resend free tier — ตัดสินใจใน ADR-003)",
     "> ข้อความใช้ Flex Message แบบเรียบ (ข้อความ + ปุ่มลิงก์ LIFF) — text ด้านล่างคือเนื้อหาหลัก ตัวแปรในวงเล็บปีกกา\n",
     "## 1. Templates\n", "| key | ผู้รับ | ช่องทาง | class (R-18) | economy mode | trigger | dedupe key | ตัวแปร | ข้อความ | Stories |", "|---|---|---|---|---|---|---|---|---|---|"]
for n in NT:
    L.append(f"| `{n['key']}` | {md(n['to'])} | {n['channels']} | {n['cls']} | {n['economy']} | {md(n['trigger'])} | `{md(n['dedupe'])}` | {md(n['variables'])} | {md(n['text'])} | {n['stories']} |")
L.append("\n## 2. Scheduled jobs (`scheduled_job.job_type`)\n\n| job_type | ตั้งเมื่อ | payload | handler | dedupe key | Stories |\n|---|---|---|---|---|---|")
for j in JOBS: L.append(f"| `{j[0]}` | {md(j[1])} | `{md(j[2])}` | {md(j[3])} | `{md(j[4])}` | {j[5]} |")
L.append("\n## 3. Cron\n\n- `POST /api/cron/tick` ทุก 1–5 นาที (cron ภายนอกฟรี) → (1) seed งานรายวัน/ราย 15 นาที ด้วย dedupe key (2) ประมวลผล scheduled_job ที่ถึงเวลา (3) ส่ง notification queued ที่ค้าง\n"
         "- handler ทุกตัวต้อง idempotent: อ่านสถานะล่าสุดจาก DB ก่อนทำ และจบเงียบ ๆ ถ้าไม่ต้องทำแล้ว\n")
w(f"{SPEC}/07-notifications-jobs.md", "\n".join(L) + "\n")

# ------------------------------------------------------------ 08 permissions
L = ["# 08 — Permission Matrix\n", "> สร้างจาก 05-api (ฟิลด์ roles) — ตรวจใน middleware ของ `/api/v1/staff/*` ด้วย `requireRole(key)` ที่อ่านจากตาราง `packages/server/src/auth/permissions.ts` ซึ่งต้องตรงกับไฟล์นี้ (มีเทสต์เทียบกับ `docs/spec/vectors/permissions.json`)\n",
     "| endpoint key | หน้าที่ | owner | front_desk | staff | หมายเหตุ |", "|---|---|---|---|---|---|"]
perm = {}
for e in EP:
    if e["auth"] != "staff": continue
    rr = e["roles"]
    perm[e["key"]] = [ROLE_NAME[c] for c in rr]
    note = "; ".join(x for x in e["effects"] if "role staff" in x or "front_desk" in x or "owner เท่านั้น" in x)
    L.append(f"| `{e['key']}` | {md(e['title'])} | {'✓' if 'O' in rr else ''} | {'✓' if 'F' in rr else ''} | {'✓' if 'S' in rr else ''} | {md(note)} |")
L.append("\n## ข้อจำกัดระดับแถว/ฟิลด์\n\n- role `staff`: groom.start/finish เฉพาะนัดที่ตนเป็น groomer; reportCards เห็นเฉพาะของตน; customers.get / calendar ไม่เห็นข้อมูลติดต่อ\n"
         "- `front_desk`: ส่วนลดรวมต่อบิล ≤ 20% ของ subtotal (R-15) ไม่งั้น `DISCOUNT_LIMIT_EXCEEDED`; ไม่เห็นยอดขายใน dashboard\n"
         "- ลูกค้า (LIFF): เข้าถึงเฉพาะ customer/pets/bookings ของตัวเองในร้านนั้น — ทุก query กรอง `customer_id = session.customerId`\n"
         "- Platform admin: ไม่มีสิทธิ์เขียนข้อมูลร้าน ยกเว้น line_channel/สถานะร้าน; ดูข้อมูลร้านผ่าน support mode (อ่านอย่างเดียว + audit)\n")
w(f"{SPEC}/08-permissions.md", "\n".join(L) + "\n")
with open(f"{SPEC}/vectors/permissions.json", "w", encoding="utf-8") as f:
    json.dump({"note": "Generated from 05-api roles. DO NOT EDIT.", "staff": perm}, f, ensure_ascii=False, indent=2)

# ------------------------------------------------------------ 09 traceability
L = ["# 09 — Traceability (Story → หน้าจอ / API / Rules / Tables)\n", "> ใช้ตอนแตก task: ทุก task ต้องอ้าง story และ artefact ในตารางนี้ · สร้างอัตโนมัติจาก 02–07\n",
     "| Story | ชื่อ | MS | Screens | API | Rules | Notify/Jobs | Tables |", "|---|---|---|---|---|---|---|---|"]
for s in ST.S:
    c = cover[s["id"]]
    L.append(f"| {s['id']} | {md(s['title'])} | {s['ms']} | {', '.join(c['screens'])} | {', '.join('`'+k+'`' for k in c['api'][:14])}{' …' if len(c['api']) > 14 else ''} | "
             f"{', '.join(sorted(set(c['rules'])))} | {', '.join(c['notify'] + c['jobs'])} | {', '.join(c['tables'])} |")
w(f"{SPEC}/09-traceability.md", "\n".join(L) + "\n")
json.dump({sid: {k: v for k, v in cover[sid].items()} for sid in STORY_IDS}, open(f"{SPEC}/vectors/story-coverage.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------ machine-readable catalogs (used by contracts/tests/CI)
import reference_data as RD
def dump(name, obj):
    with open(f"{SPEC}/vectors/{name}", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
dump("errors.json", {"note": "Error catalog (05 §1). packages/contracts/src/errors.ts must match exactly. DO NOT EDIT.",
                     "errors": [{"code": c, "http": h, "messageTh": m, "when": wn} for c, h, m, wn in ERRORS]})
dump("endpoints.json", {"note": "Endpoint catalog (05 §3). scripts/check-spec-conformance.mjs uses this. DO NOT EDIT.",
                        "endpoints": [{"key": e["key"], "method": e["method"], "path": e["path"], "auth": e["auth"], "roles": e["roles"],
                                       "request": [f[0] for f in e["req"]], "query": [f[0] for f in e["query"]], "response": e["res"],
                                       "errors": [x.strip() for x in e["errors"].split(",") if x.strip()]} for e in EP],
                        "dtos": sorted(DTOS)})
dump("screens.json", {"note": "Screen catalog (06). page.tsx routes must come from here. DO NOT EDIT.",
                      "screens": [{"id": s["id"], "app": s["app"], "route": s["route"], "title": s["title"], "roles": s["roles"],
                                   "load": s["load"], "fields": [{"section": sec, "mode": f[0], "label": f[1], "source": f[2]} for sec, fs in s["sections"] for f in fs],
                                   "actions": [{"label": a[0], "endpoints": a[1]} for a in s["actions"]]} for s in SCR]})
dump("rule-modules.json", {"note": "Which module implements which rule export (packages/domain). DO NOT EDIT.",
                           "modules": [{"rule": r["id"], "export": v["export"], "file": r["file"], "vectors": f"{r['id']}.{v['export']}.json"} for r in RS.RULES for v in r["vectors"]]})
dump("reference-data.json", {"note": "Seed/reference data (10-reference-data.md). DO NOT EDIT.",
     "vaccineTypes": [dict(zip(["code", "species", "nameTh", "nameEn", "defaultValidityMonths", "sortOrder"], v)) for v in RD.VACCINE_TYPES],
     "defaultSizeTiers": [dict(zip(["species", "code", "labelTh", "minGrams", "maxGrams", "sortOrder"], v)) for v in RD.DEFAULT_SIZE_TIERS],
     "newShopDefaults": RD.NEW_SHOP_DEFAULTS, "provinces": RD.PROVINCES, "breeds": RD.BREEDS, "templates": RD.TEMPLATES,
     "legalDocs": RD.LEGAL_DOCS, "petConditionFlags": RD.PET_CONDITION_FLAGS, "consentReasons": RD.CONSENT_REASONS, "amenities": RD.AMENITIES})

L = ["# 10 — Reference Data (ข้อมูลตั้งต้นที่ห้ามแต่งเอง)\n",
     "> ค่าทั้งหมดในไฟล์นี้อยู่ใน `docs/spec/vectors/reference-data.json` ด้วย — โค้ด/seed/test ให้อ่านจาก JSON นั้น ห้ามพิมพ์ค่าซ้ำเอง\n",
     '<a id="vaccine-types"></a>\n\n## 1. ชนิดวัคซีน (`vaccine_type` — seed migration)\n',
     "| code | ชนิดสัตว์ | ชื่อไทย | ชื่ออังกฤษ | อายุ (เดือน) | ลำดับ |", "|---|---|---|---|---|---|"]
L += [f"| `{c}` | {sp} | {md(th)} | {md(en)} | {mo} | {so} |" for c, sp, th, en, mo, so in RD.VACCINE_TYPES]
L += ['\n<a id="size-tiers"></a>\n\n## 2. ขนาดตามน้ำหนักมาตรฐาน (ร้านใหม่ — admin.createOrg)\n',
      "| ชนิด | code | ป้าย | ตั้งแต่ (กรัม) | ไม่ถึง (กรัม) | ลำดับ |", "|---|---|---|---|---|---|"]
L += [f"| {sp} | `{c}` | {md(lb)} | {mn} | {mx if mx is not None else '—'} | {so} |" for sp, c, lb, mn, mx, so in RD.DEFAULT_SIZE_TIERS]
L += ['\n<a id="new-shop-defaults"></a>\n\n## 3. ค่าเริ่มต้นของร้านใหม่\n', "| รายการ | ค่า |", "|---|---|"]
L += [f"| `{k}` | {md(json.dumps(v, ensure_ascii=False))} |" for k, v in RD.NEW_SHOP_DEFAULTS.items()]
L += ['\n<a id="templates"></a>\n\n## 4. ข้อความแม่แบบ\n', f"> {RD.TEMPLATE_NOTE}\n"]
for k, v in RD.TEMPLATES.items(): L += [f"**`{k}`**\n", f"> {v}\n"]
L += ['\n<a id="legal-docs"></a>\n\n## 5. เอกสารกฎหมาย (ฉบับปัจจุบัน)\n', "| เอกสาร | version | ไฟล์เนื้อหา | route |", "|---|---|---|---|"]
L += [f"| `{k}` | {v['version']} | `{v['file']}` | {('`' + v['route'] + '`') if v['route'] else '—'} |" for k, v in RD.LEGAL_DOCS.items()]
L += ['\n<a id="lists"></a>\n\n## 6. รายการตัวเลือก\n',
      "**สภาพที่พบตอนรับ (`groom_appointment.condition_flags`)**: " + ", ".join(f"`{k}` {v}" for k, v in RD.PET_CONDITION_FLAGS.items()) + "\n",
      "**เหตุผลใบยินยอม (`consent_document.reasons`)**: " + ", ".join(f"`{k}` {v}" for k, v in RD.CONSENT_REASONS.items()) + "\n",
      "**สิ่งอำนวยความสะดวกห้อง (`room_type.amenities`)**: " + ", ".join(f"`{k}` {v}" for k, v in RD.AMENITIES.items()) + "\n",
      f"**จังหวัด** ({len(RD.PROVINCES)}): " + ", ".join(RD.PROVINCES) + "\n"]
for sp, lst in RD.BREEDS.items(): L.append(f"**สายพันธุ์ {sp}** ({len(lst)}): " + ", ".join(lst) + "\n")
w(f"{SPEC}/10-reference-data.md", "\n".join(L) + "\n")
print("rendered docs to", SPEC)
