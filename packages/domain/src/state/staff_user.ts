import { createCanTransition } from "./canTransition.ts";

export const STATES = ["invited", "active", "disabled"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  invited: ["active"],
  active: ["disabled"],
  disabled: ["active"],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
