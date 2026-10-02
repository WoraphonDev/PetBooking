import { createCanTransition } from "./canTransition.ts";

export const STATES = ["pending_review", "verified", "rejected"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  pending_review: ["verified", "rejected"],
  verified: [],
  rejected: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
