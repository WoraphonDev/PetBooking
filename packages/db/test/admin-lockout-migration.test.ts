import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { expect, it } from "vitest";
import { migrationFiles } from "../src/test-db";

it("adds lockout defaults to existing admins while preserving credentials and supports persistent lock/reset", async () => {
  const pg = new PGlite({ extensions: { btree_gist } });
  try {
    const files = migrationFiles();
    const upgrade = "0004_quiet_la_nuit.sql";
    const index = files.indexOf(upgrade);
    expect(index).toBeGreaterThan(0);
    for (const file of files.slice(0, index)) {
      await pg.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    }
    const admin = { email: "admin@example.test", password_hash: "existing-hash", display_name: "Admin", status: "active" };
    await pg.query("insert into platform_admin (email, password_hash, display_name) values ($1, $2, $3)", [
      admin.email,
      admin.password_hash,
      admin.display_name,
    ]);
    await pg.exec(readFileSync(new URL(`../migrations/${upgrade}`, import.meta.url), "utf8"));
    const select = () =>
      pg.query("select email, password_hash, display_name, status, failed_login_count, locked_until from platform_admin");
    expect((await select()).rows).toEqual([{ ...admin, failed_login_count: 0, locked_until: null }]);
    await pg.query("update platform_admin set failed_login_count = 4, locked_until = $1", ["2026-10-05T03:15:00Z"]);
    expect((await select()).rows).toEqual([{ ...admin, failed_login_count: 4, locked_until: new Date("2026-10-05T03:15:00Z") }]);
    await pg.exec("update platform_admin set failed_login_count = 0, locked_until = null");
    expect((await select()).rows).toEqual([{ ...admin, failed_login_count: 0, locked_until: null }]);
  } finally {
    await pg.close();
  }
});
