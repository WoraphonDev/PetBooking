import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Machine = { states: string[]; transitions: { from: string[]; to: string[] }[] };
type StateModule = {
  STATES: readonly string[];
  ALLOWED_TRANSITIONS: Record<string, string[]>;
  canTransition(from: string, to: string): boolean;
};
const { machines } = JSON.parse(readFileSync(new URL("../../../docs/spec/vectors/state-machines.json", import.meta.url), "utf8")) as {
  machines: Record<string, Machine>;
};
const directory = new URL("../src/state/", import.meta.url);

it("implements exactly the catalog's machines", () => {
  expect(
    readdirSync(directory)
      .filter((file) => file !== "canTransition.ts")
      .sort(),
  ).toEqual(
    Object.keys(machines)
      .map((name) => `${name}.ts`)
      .sort(),
  );
});
for (const [name, machine] of Object.entries(machines)) {
  describe(name, async () => {
    const module = (await import(new URL(`${name}.ts`, directory).href)) as StateModule;
    const expected = Object.fromEntries(machine.states.map((state) => [state, new Set<string>()]));
    for (const transition of machine.transitions) {
      for (const from of transition.from) {
        if (from === "∅") continue;
        for (const to of transition.to) expected[from]?.add(to);
      }
    }
    it("exports exactly the documented states and transitions, excluding creation", () => {
      expect(module.STATES).toEqual(machine.states);
      expect(Object.keys(module.ALLOWED_TRANSITIONS).sort()).toEqual([...machine.states].sort());
      for (const state of machine.states) {
        expect([...(module.ALLOWED_TRANSITIONS[state] ?? [])].sort()).toEqual([...(expected[state] ?? [])].sort());
      }
    });
    it("accepts exactly the documented pairs, including only documented self-transitions", () => {
      for (const from of machine.states) {
        for (const to of machine.states) {
          expect(module.canTransition(from, to), `${name}: ${from} -> ${to}`).toBe(expected[from]?.has(to) ?? false);
        }
      }
    });
    it("rejects creation markers, unknown states and inherited object keys", () => {
      for (const invalid of ["∅", "unknown", "", "__proto__", "constructor", "toString"]) {
        for (const state of machine.states) {
          expect(module.canTransition(invalid, state)).toBe(false);
          expect(module.canTransition(state, invalid)).toBe(false);
        }
      }
    });
  });
}
