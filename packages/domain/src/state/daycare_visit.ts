import { createCanTransition } from "./canTransition.ts";

export const STATES = ["reserved", "checked_in", "checked_out", "no_show", "cancelled"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  reserved: ["checked_in", "no_show", "cancelled"],
  checked_in: ["checked_out"],
  checked_out: [],
  no_show: [],
  cancelled: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
