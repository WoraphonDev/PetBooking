import { createCanTransition } from "./canTransition.ts";

export const STATES = ["awaiting_deposit", "deposit_review", "awaiting_approval", "confirmed", "cancelled", "expired", "closed"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  awaiting_deposit: ["deposit_review", "confirmed", "awaiting_approval", "expired", "cancelled"],
  deposit_review: ["confirmed", "awaiting_approval", "awaiting_deposit", "expired", "cancelled"],
  awaiting_approval: ["confirmed", "cancelled", "expired"],
  confirmed: ["cancelled", "closed"],
  cancelled: [],
  expired: [],
  closed: ["confirmed"],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
