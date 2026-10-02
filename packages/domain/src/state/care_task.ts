import { createCanTransition } from "./canTransition.ts";

export const STATES = ["pending", "done", "skipped"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  pending: ["done", "skipped"],
  done: [],
  skipped: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
