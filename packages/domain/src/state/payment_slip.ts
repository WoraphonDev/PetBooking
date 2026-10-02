import { createCanTransition } from "./canTransition.ts";

export const STATES = ["submitted", "verified", "rejected"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  submitted: ["verified", "rejected"],
  verified: [],
  rejected: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
