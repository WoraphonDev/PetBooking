#!/usr/bin/env node
// Guard: everything the app exposes must exist in the spec (extras fail; missing = not implemented yet).
//  - apps/web/app/**/route.ts  ⇄ docs/spec/vectors/endpoints.json (path + HTTP methods)
//  - apps/web/app/**/page.tsx  ⇄ docs/spec/vectors/screens.json   (route + app group)
//  - packages/contracts/src/endpoints/<key>.ts and src/dto/<kebab>.ts ⇄ endpoint keys / DTO names
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const { endpoints, dtos } = read("docs/spec/vectors/endpoints.json");
const { screens } = read("docs/spec/vectors/screens.json");
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) =>
        statSync(join(dir, f)).isDirectory() ? (f === "node_modules" ? [] : walk(join(dir, f))) : [join(dir, f)],
      )
    : [];
const errors = [];

// --- routes
const routeMethods = new Map();
for (const e of endpoints) {
  const file = `apps/web/app${e.path.replace(/\{(\w+)\}/g, "[$1]")}/route.ts`;
  routeMethods.set(file, [...(routeMethods.get(file) ?? []), e.method]);
}
const routes = walk(join(ROOT, "apps/web/app"))
  .map((f) => relative(ROOT, f))
  .filter((f) => /\/route\.(ts|tsx|js)$/.test(f));
for (const f of routes) {
  const allowed = routeMethods.get(f.replace(/\.(tsx|js)$/, ".ts"));
  if (!allowed) {
    errors.push(`${f}: route not in 05-api (endpoints.json)`);
    continue;
  }
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const m of src.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g))
    if (!allowed.includes(m[1])) errors.push(`${f}: method ${m[1]} not in 05-api (allowed: ${allowed.join(", ")})`);
}

// --- pages
const GROUP = { console: "(console)", staff: "(staff)", liff: "(liff)", admin: "(admin)", auth: "(auth)", public: "(public)" };
const pageFiles = new Set(["apps/web/app/page.tsx"]); // root: redirect only (→ /login)
for (const s of screens)
  for (const r of s.route
    .split("|")
    .map((x) => x.split("?")[0].trim())
    .filter((x) => x.startsWith("/")))
    pageFiles.add(`apps/web/app/${GROUP[s.app]}${r.replace(/\/$/, "")}/page.tsx`);
const pages = walk(join(ROOT, "apps/web/app"))
  .map((f) => relative(ROOT, f))
  .filter((f) => /\/page\.(tsx|ts|jsx|js|mdx)$/.test(f));
for (const f of pages)
  if (!pageFiles.has(f.replace(/\.(ts|jsx|js|mdx)$/, ".tsx"))) errors.push(`${f}: page not in 06-screens (screens.json)`);

// --- contracts
const keys = new Set(endpoints.map((e) => e.key));
for (const f of walk(join(ROOT, "packages/contracts/src/endpoints"))) {
  const k = relative(join(ROOT, "packages/contracts/src/endpoints"), f).replace(/\.ts$/, "");
  if (!keys.has(k)) errors.push(`packages/contracts/src/endpoints/${k}.ts: not an endpoint key in 05`);
}
const kebab = (n) => n.replace(/(?<!^)(?=[A-Z])/g, "-").toLowerCase();
const dtoFiles = new Set(dtos.map(kebab));
for (const f of walk(join(ROOT, "packages/contracts/src/dto"))) {
  const n = relative(join(ROOT, "packages/contracts/src/dto"), f).replace(/\.ts$/, "");
  if (!dtoFiles.has(n)) errors.push(`packages/contracts/src/dto/${n}.ts: not a DTO in 05 §2`);
}

const implRoutes = routes.length,
  implPages = pages.length;
if (errors.length) {
  console.error(`spec conformance FAILED (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  console.error("ทุก route/page/contract ต้องมีใน docs/spec — ถ้าคิดว่า spec ขาด ให้เขียน docs/questions.md");
  process.exit(1);
}
console.log(
  `spec conformance OK — routes ${implRoutes}/${routeMethods.size}, pages ${implPages}/${pageFiles.size - 1} implemented, no extras`,
);
