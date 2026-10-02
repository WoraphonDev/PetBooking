import { createCanTransition } from "./canTransition.ts";

export const STATES = ["pending", "approved", "rejected"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  pending: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
