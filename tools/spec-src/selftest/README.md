# Spec self-test (รันโดยมนุษย์/CI ของ spec — ไม่ใช่โค้ดของแอป)

พิสูจน์ว่า spec ที่ generate ออกมา "ใช้ได้จริง" ก่อนแจกให้ agent:

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `vectors-proof.mts` | เขียน R-04, R-07, R-13, R-26, R-30, R-22, R-31 ใหม่ด้วย TypeScript แยกจาก Python reference แล้วต้องได้ผลตรง vectors ทุกเคส (จับ spec ที่ตีความได้สองทาง) |
| `db-proof.mts` | migrate schema ที่ generate ได้ + `_custom_constraints.sql` บน PGlite แล้วทดสอบ exclusion constraint (ช่าง/โต๊ะ/ห้อง/น้องซ้อนเวลา), check constraint, append-only trigger, FK booking.bill_id |

```bash
mkdir /tmp/selftest && cd /tmp/selftest && npm init -y
npm i drizzle-orm drizzle-kit @electric-sql/pglite typescript tsx @date-fns/tz date-fns @types/node
cp -r <repo>/packages/db/src/schema ./src/schema   # + drizzle.config.ts (dialect postgresql, schema ./src/schema/index.ts, out ./migrations)
npx tsc --noEmit -p .            # schema compile (strict)
npx drizzle-kit generate --name init
npx tsx <repo>/tools/spec-src/selftest/db-proof.mts ./migrations      # → PROOF OK
npx tsx <repo>/tools/spec-src/selftest/vectors-proof.mts              # → TS proof: 57 passed, 0 failed
```

ผลล่าสุด (checkpoint 2, 2026-10-01): tsc ผ่าน · drizzle-kit 0.31 → 452 statements · 72 ตาราง · 43 check · 4 exclusion · db-proof 21/21 ok · vectors-proof 57/57
