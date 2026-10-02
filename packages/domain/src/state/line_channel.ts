import { createCanTransition } from "./canTransition.ts";

export const STATES = ["pending", "active", "error"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  pending: ["pending", "active", "error"],
  active: ["pending", "error"],
  error: ["pending", "active", "error"],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
