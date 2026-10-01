# -*- coding: utf-8 -*-
"""Generate Drizzle schema files, custom SQL and docs/spec/02-data-model.md from model.py"""
import os, re, sys, hashlib, json
sys.path.insert(0, os.path.dirname(__file__))
from model import ENUMS, ENUM_DESC, T, CUSTOM_SQL

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DB = f"{ROOT}/packages/db"

GROUP_FILE = {
    "A": "platform", "B": "identity", "C": "line", "D": "customers", "E": "catalog",
    "F": "bookings", "G": "billing", "H": "aftercare", "I": "messaging", "J": "compliance",
}

def camel(s):
    p = s.split("_")
    return p[0] + "".join(x[:1].upper() + x[1:] for x in p[1:])

def enum_const(e):
    return camel(e) + "Enum"

TABLES = {t["name"]: t for t in T}
for t in T:
    t["file"] = GROUP_FILE[t["group"][0]]

# ---------- column normalisation ----------
def full_cols(t):
    """returns list of (name,type,nullable,default,ref,desc,is_pk)"""
    out = []
    pk = t["pk"]
    if pk == "id":
        out.append(("id", "uuid", False, "random", None, "PK", True))
    for c in t["cols"]:
        name, typ, nul, dflt, ref, desc = c
        is_pk = (pk == name)
        out.append((name, typ, nul, dflt, ref, desc, is_pk))
    out.append(("created_at", "ts", False, "now", None, "เวลาสร้าง (UTC)", False))
    if t["updated"]:
        out.append(("updated_at", "ts", False, "now", None, "เวลาแก้ไขล่าสุด (UTC) — อัปเดตโดย $onUpdate", False))
    names = [c[0] for c in out]
    assert len(names) == len(set(names)), f"dup column in {t['name']}"
    return out

def sql_type(typ):
    base = {"uuid": "uuid", "text": "text", "int": "integer", "bool": "boolean", "date": "date",
            "time": "time", "ts": "timestamptz", "jsonb": "jsonb", "float": "double precision",
            "text[]": "text[]", "uuid[]": "uuid[]", "time[]": "time[]"}
    if typ.startswith("e:"):
        return typ[2:]
    if typ.startswith("e[]:"):
        return typ[4:] + "[]"
    return base[typ]

def sql_default(typ, d):
    if d is None:
        return ""
    if d == "now": return "now()"
    if d == "random": return "gen_random_uuid()"
    if d == "[]": return "'{}'"
    if isinstance(d, bool): return "true" if d else "false"
    if isinstance(d, int): return str(d)
    if isinstance(d, str) and d.startswith("sql:"): return d[4:]
    return f"'{d}'"

def parse_ref(ref):
    if not ref: return None
    target, _, action = ref.partition("|")
    tt, tc = target.split(".")
    return tt, tc, action or None

# ---------- validation of the model ----------
errors = []
for t in T:
    cols = {c[0]: c for c in full_cols(t)}
    for c in full_cols(t):
        r = parse_ref(c[4])
        if r:
            tt, tc, act = r
            if tt not in TABLES:
                errors.append(f"{t['name']}.{c[0]} → unknown table {tt}")
            elif tc not in {x[0] for x in full_cols(TABLES[tt])}:
                errors.append(f"{t['name']}.{c[0]} → unknown column {tt}.{tc}")
            if act == "setnull" and not c[2]:
                errors.append(f"{t['name']}.{c[0]} setnull on NOT NULL column")
        if c[1].startswith("e:") or c[1].startswith("e[]:"):
            en = c[1].split(":", 1)[1]
            if en not in ENUMS:
                errors.append(f"{t['name']}.{c[0]} unknown enum {en}")
            elif c[3] not in (None, "[]") and c[3] not in ENUMS[en]:
                errors.append(f"{t['name']}.{c[0]} default {c[3]} not in enum {en}")
    for kind, icols, where in t["idx"]:
        for ic in icols:
            if ic not in cols:
                errors.append(f"{t['name']} index on unknown column {ic}")
    pk = t["pk"]
    for p in ([pk] if isinstance(pk, str) else pk):
        if p not in cols:
            errors.append(f"{t['name']} pk unknown {p}")
used_enums = set()
for t in T:
    for c in full_cols(t):
        if c[1].startswith("e"):
            if ":" in c[1]:
                used_enums.add(c[1].split(":", 1)[1])
unused = set(ENUMS) - used_enums
if unused:
    errors.append(f"unused enums: {sorted(unused)}")
if errors:
    print("\n".join(errors)); sys.exit(1)

# ---------- TS generation ----------
def ident_name(table, cols, kind):
    n = f"{table}_{'_'.join(cols)}_{'uq' if kind == 'unique' else 'idx'}"
    if len(n) > 63:
        h = hashlib.sha1(n.encode()).hexdigest()[:6]
        n = n[:56] + "_" + h
    return n

def ts_str(s):
    return json.dumps(s, ensure_ascii=False)

def col_ts(t, c, imports, table_imports):
    name, typ, nul, dflt, ref, desc, is_pk = c
    if typ.startswith("e:"):
        en = typ[2:]; expr = f'{enum_const(en)}("{name}")'; imports["enum"].add(enum_const(en))
    elif typ.startswith("e[]:"):
        en = typ[4:]; expr = f'{enum_const(en)}("{name}").array()'; imports["enum"].add(enum_const(en))
    else:
        fn = {"uuid": "uuid", "text": "text", "int": "integer", "bool": "boolean", "date": "date",
              "time": "time", "ts": "timestamp", "jsonb": "jsonb", "float": "doublePrecision",
              "text[]": "text", "uuid[]": "uuid", "time[]": "time"}[typ]
        imports["core"].add(fn)
        if typ == "ts":
            expr = f'timestamp("{name}", {{ withTimezone: true, mode: "date" }})'
        elif typ == "date":
            expr = f'date("{name}", {{ mode: "string" }})'
        else:
            expr = f'{fn}("{name}")'
        if typ.endswith("[]"):
            expr += ".array()"
    if is_pk:
        expr += ".primaryKey()"
    if not nul and not is_pk:
        expr += ".notNull()"
    if dflt is not None:
        if dflt == "now":
            expr += ".defaultNow()"
        elif dflt == "random":
            expr += ".defaultRandom()"
        elif dflt == "[]":
            expr += ".default(sql`'{}'`)"; imports["sql"] = True
        elif isinstance(dflt, bool):
            expr += f".default({'true' if dflt else 'false'})"
        elif isinstance(dflt, int):
            expr += f".default({dflt})"
        elif isinstance(dflt, str) and dflt.startswith("sql:"):
            expr += f".default(sql`{dflt[4:]}`)"; imports["sql"] = True
        else:
            expr += f".default({ts_str(dflt)})"
    if name == "updated_at":
        expr += ".$onUpdate(() => new Date())"
    r = parse_ref(ref)
    if r:
        tt, tc, act = r
        imports["core"].add("type AnyPgColumn")
        target_file = TABLES[tt]["file"]
        if target_file != t["file"]:
            table_imports.setdefault(target_file, set()).add(camel(tt))
        opts = ""
        if act == "cascade": opts = ', { onDelete: "cascade" }'
        elif act == "setnull": opts = ', { onDelete: "set null" }'
        expr += f".references((): AnyPgColumn => {camel(tt)}.{camel(tc)}{opts})"
    comment = f"  /** {desc.replace('*/', '* /')} */\n" if desc and desc != "PK" else ""
    return f"{comment}  {camel(name)}: {expr},"

def table_ts(t, imports, table_imports):
    lines = [f"/** {t['desc']} — {t['stories']} */",
             f'export const {camel(t["name"])} = pgTable(', f'  "{t["name"]}",', "  {"]
    for c in full_cols(t):
        lines.append("  " + col_ts(t, c, imports, table_imports).replace("\n  ", "\n    "))
    lines.append("  },")
    extras = []
    if isinstance(t["pk"], list):
        imports["core"].add("primaryKey")
        extras.append(f"primaryKey({{ columns: [{', '.join('t.' + camel(c) for c in t['pk'])}] }})")
    for kind, icols, where in t["idx"]:
        fn = "uniqueIndex" if kind == "unique" else "index"
        imports["core"].add(fn)
        e = f'{fn}("{ident_name(t["name"], icols, kind)}").on({", ".join("t." + camel(c) for c in icols)})'
        if where:
            e += f".where(sql`{where}`)"; imports["sql"] = True
        extras.append(e)
    for cname, expr in t["checks"]:
        imports["core"].add("check"); imports["sql"] = True
        extras.append(f'check("{cname}", sql`{expr}`)')
    if extras:
        lines.append("  (t) => [")
        for e in extras:
            lines.append(f"    {e},")
        lines.append("  ],")
    lines.append(");")
    return "\n".join(lines)

HEADER = "// GENERATED from tools/model.py on day 0. From now on this file is edited by hand —\n// every change MUST be mirrored in docs/spec/02-data-model.md (CI: pnpm --filter @app/db check:doc).\n"

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

files = {}
for t in T:
    files.setdefault(t["file"], []).append(t)

# enums.ts
en_lines = [HEADER, 'import { pgEnum } from "drizzle-orm/pg-core";', ""]
for en, vals in ENUMS.items():
    if en in ENUM_DESC:
        en_lines.append(f"/** {ENUM_DESC[en]} */")
    en_lines.append(f'export const {enum_const(en)} = pgEnum("{en}", [{", ".join(ts_str(v) for v in vals)}]);')
write(f"{DB}/src/schema/enums.ts", "\n".join(en_lines) + "\n")

order = list(GROUP_FILE.values())
for fname in order:
    imports = {"core": {"pgTable"}, "enum": set(), "sql": False}
    table_imports = {}
    body = [table_ts(t, imports, table_imports) for t in files[fname]]
    core = sorted(imports["core"], key=lambda x: x.replace("type ", ""))
    head = [HEADER]
    if imports["sql"]:
        head.append('import { sql } from "drizzle-orm";')
    head.append("import {\n" + "".join(f"  {c},\n" for c in core) + '} from "drizzle-orm/pg-core";')
    if imports["enum"]:
        head.append("import {\n" + "".join(f"  {c},\n" for c in sorted(imports["enum"])) + '} from "./enums";')
    for tf in sorted(table_imports):
        head.append("import { " + ", ".join(sorted(table_imports[tf])) + f' }} from "./{tf}";')
    write(f"{DB}/src/schema/{fname}.ts", "\n".join(head) + "\n\n" + "\n\n".join(body) + "\n")

write(f"{DB}/src/schema/index.ts", HEADER + 'export * from "./enums";\n' +
      "".join(f'export * from "./{f}";\n' for f in order))

# custom SQL — split statements with drizzle breakpoint
stmts, buf = [], []
for line in CUSTOM_SQL.strip().split("\n"):
    buf.append(line)
    s = "\n".join(buf).strip()
    in_fn = s.count("$$") % 2 == 1
    if line.rstrip().endswith(";") and not in_fn:
        stmts.append("\n".join(buf).strip()); buf = []
assert not "".join(buf).strip(), buf
custom_sql = "\n--> statement-breakpoint\n".join(stmts) + "\n"
write(f"{ROOT}/tools/_custom_constraints.sql", custom_sql)

# ---------- 02-data-model.md ----------
def md_esc(s):
    return (s or "").replace("|", "\\|")

groups = []
for t in T:
    if t["group"] not in groups:
        groups.append(t["group"])

md = []
md.append("# 02 — Data Model (field-level)\n")
md.append("> **สถานะ:** สัญญาข้อมูลของ MVP — `packages/db/src/schema/*.ts` ต้องตรงกับไฟล์นี้ทุกตาราง/ทุกคอลัมน์ (CI ตรวจด้วย `pnpm --filter @app/db check:doc`)\n"
          "> **ลำดับการแก้:** แก้ไฟล์นี้ก่อน (spec-first) → แก้ schema → `pnpm --filter @app/db generate` → commit migration ที่ได้ → เปิด PR พร้อม label `schema`\n")
md.append("## 0. กติกาที่ใช้ทุกตาราง\n")
md.append("""| เรื่อง | กติกา |
|---|---|
| Primary key | `id uuid default gen_random_uuid()` ยกเว้นตารางที่ระบุ PK เอง |
| Tenant | ตารางธุรกิจทุกตารางมี `organization_id` — **ทุก query ต้องกรองด้วย organization_id ของ session** ผ่าน repository helper เท่านั้น (ห้ามเขียน query ตรงจาก route) |
| เงิน | `*_satang` เป็น integer หน่วยสตางค์ (฿1 = 100) ห้ามใช้ float/decimal ใน JS; แสดงผลด้วย `formatTHB()` |
| เวลา | `timestamptz` เก็บ UTC เสมอ; แปลงเป็นเวลาไทยตอนแสดงผลด้วย `branch.timezone` |
| วันที่ท้องถิ่น | คอลัมน์ `date` (เช่น `check_in_date`) เป็นวันตามเวลาไทย อ่าน/เขียนเป็น string `YYYY-MM-DD` (Drizzle `mode: "string"`) ห้ามแปลงเป็น `Date` |
| เวลาในวัน | คอลัมน์ `time` เป็นเวลาท้องถิ่น `HH:MM` |
| น้ำหนัก | `*_grams` integer กรัม (5.2 กก. = 5200) |
| เปอร์เซ็นต์ค่ามือ | basis points (1500 = 15.00%) |
| ลบข้อมูล | ไม่ hard delete ข้อมูลธุรกิจ — ใช้ `status = archived` หรือสถานะ cancelled; hard delete ได้เฉพาะ PDPA (`owner_profile.erased_at`) |
| Snapshot | ราคา/ชื่อบริการ/นโยบาย ณ เวลาจอง ถูกคัดลอกลง `*_snapshot`, `price_satang` ของรายการ — ห้ามคำนวณย้อนจาก catalog ปัจจุบัน |
| Append-only | `audit_log`, `booking_event`, `credit_ledger`, `consent_record` — DB trigger ห้าม UPDATE/DELETE |
| updated_at | อัปเดตโดย Drizzle `$onUpdate` (ไม่มี DB trigger) — ถ้าใช้ raw SQL ต้องตั้งเอง |
| ชื่อ | snake_case ใน DB, camelCase ใน TypeScript (Drizzle map ให้) |
""")
md.append("\n## 1. สารบัญตาราง\n")
md.append("| กลุ่ม | ตาราง | คำอธิบาย | ไฟล์ schema | Stories |")
md.append("|---|---|---|---|---|")
for t in T:
    md.append(f"| {t['group'][0]} | [`{t['name']}`](#tbl-{t['name']}) | {md_esc(t['desc'])} | `{t['file']}.ts` | {t['stories']} |")
md.append(f"\nรวม **{len(T)} ตาราง**, **{sum(len(full_cols(t)) for t in T)} คอลัมน์**, **{len(ENUMS)} enum**\n")

n = 2
for g in groups:
    md.append(f"\n## {n}. {g}\n"); n += 1
    for t in [x for x in T if x["group"] == g]:
        pk = t["pk"] if isinstance(t["pk"], str) else "(" + ", ".join(t["pk"]) + ")"
        md.append(f"\n<a id=\"tbl-{t['name']}\"></a>\n\n### {t['name']}\n")
        md.append(f"{t['desc']}  \nStories: {t['stories']} · PK: `{pk}` · schema: `packages/db/src/schema/{t['file']}.ts`\n")
        md.append("| Column | Type | Nullable | Default | FK | Description |")
        md.append("|---|---|---|---|---|---|")
        for c in full_cols(t):
            name, typ, nul, dflt, ref, desc, is_pk = c
            r = parse_ref(ref)
            fk = ""
            if r:
                fk = f"{r[0]}.{r[1]}" + (f" ({'cascade' if r[2]=='cascade' else 'set null'})" if r[2] else "")
            if t["name"] == "booking" and name == "bill_id":
                fk = "bill.id (set null) — ใน 0001_constraints.sql"
            d = desc if not (is_pk and desc in ("", "PK")) else "PK"
            md.append(f"| {name} | `{sql_type(typ)}` | {'YES' if nul else 'NO'} | {md_esc(sql_default(typ, dflt))} | {md_esc(fk)} | {md_esc(d)} |")
        if t["idx"] or t["checks"]:
            md.append("")
            for kind, icols, where in t["idx"]:
                md.append(f"- {'UNIQUE' if kind == 'unique' else 'INDEX'} `{ident_name(t['name'], icols, kind)}` ({', '.join(icols)})" + (f" WHERE `{where}`" if where else ""))
            for cname, expr in t["checks"]:
                md.append(f"- CHECK `{cname}`: `{expr}`")
        md.append("")

md.append(f"\n## {n}. Enums\n"); n += 1
md.append("| Enum | ค่า | หมายเหตุ |")
md.append("|---|---|---|")
for en, vals in ENUMS.items():
    md.append(f"| `{en}` | {', '.join('`'+v+'`' for v in vals)} | {md_esc(ENUM_DESC.get(en, ''))} |")

md.append(f"\n## {n}. Constraints ที่ Drizzle เขียนไม่ได้ (migration `0001_constraints.sql`)\n"); n += 1
md.append("ไฟล์นี้เป็น custom migration — **ห้ามลบหรือแก้ย้อนหลัง** ถ้าต้องเปลี่ยนให้สร้าง custom migration ใหม่ด้วย `pnpm --filter @app/db generate:custom <name>`\n")
md.append("| Constraint | ตาราง | ป้องกันอะไร | error code ที่แอปต้องจับ |")
md.append("|---|---|---|---|")
md.append("| `groom_appt_groomer_no_overlap` | groom_appointment | ช่างคนเดียวมีนัดทับเวลา (นับรวม buffer: `starts_at`–`blocked_until`) ยกเว้นนัด cancelled/no_show | `23P01` → แปลงเป็น `SLOT_TAKEN` (409) |")
md.append("| `groom_appt_station_no_overlap` | groom_appointment | โต๊ะเดียวมีนัดทับเวลา | `23P01` → `SLOT_TAKEN` (409) |")
md.append("| `stay_room_no_overlap` | stay | ห้องเดียวมีการพักทับคืน (reserved/checked_in) — วันเช็คเอาท์ของคนหนึ่งเป็นวันเช็คอินของอีกคนได้ | `23P01` → `ROOM_TAKEN` (409) |")
md.append("| `stay_pet_no_overlap` | stay | น้องตัวเดียวถูกจองพักซ้อนกัน | `23P01` → `PET_ALREADY_BOOKED` (409) |")
md.append("| `booking_bill_fk` | booking | FK วนกับ bill | `23503` |")
md.append("| trigger `*_append_only` | audit_log, booking_event, credit_ledger, consent_record | ห้าม UPDATE/DELETE | `P0001` (bug — ต้องไม่เกิด) |")
md.append("\n```sql\n" + CUSTOM_SQL.strip() + "\n```\n")
write(f"{ROOT}/docs/spec/02-data-model.md", "\n".join(md))

print("tables", len(T), "columns", sum(len(full_cols(t)) for t in T), "enums", len(ENUMS))
print("files", {k: len(v) for k, v in files.items()})
