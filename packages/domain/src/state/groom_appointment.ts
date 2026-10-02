import { createCanTransition } from "./canTransition.ts";

export const STATES = ["scheduled", "checked_in", "in_progress", "done", "picked_up", "no_show", "cancelled"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  scheduled: ["scheduled", "checked_in", "no_show", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["done"],
  done: ["picked_up"],
  picked_up: [],
  no_show: [],
  cancelled: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
