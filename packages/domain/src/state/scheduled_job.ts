import { createCanTransition } from "./canTransition.ts";

export const STATES = ["pending", "running", "done", "failed", "cancelled"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  pending: ["running", "cancelled"],
  running: ["done", "pending", "failed"],
  done: [],
  failed: [],
  cancelled: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
