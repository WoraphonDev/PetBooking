import { createCanTransition } from "./canTransition.ts";

export const STATES = ["active", "exhausted", "expired", "void"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  active: ["exhausted", "expired", "void"],
  exhausted: ["active", "void"],
  expired: ["void"],
  void: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
