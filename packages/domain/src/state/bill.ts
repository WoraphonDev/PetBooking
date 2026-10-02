import { createCanTransition } from "./canTransition.ts";

export const STATES = ["open", "paid", "void"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  open: ["paid", "void"],
  paid: ["void"],
  void: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
