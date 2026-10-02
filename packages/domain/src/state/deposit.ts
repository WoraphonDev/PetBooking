import { createCanTransition } from "./canTransition.ts";

export const STATES = [
  "not_required",
  "pending",
  "submitted",
  "verified",
  "rejected",
  "refunded",
  "credited",
  "forfeited",
  "applied",
] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  not_required: [],
  pending: ["submitted", "verified", "not_required"],
  submitted: ["verified", "rejected", "not_required"],
  verified: ["applied", "refunded", "credited", "forfeited"],
  rejected: ["submitted", "verified", "not_required"],
  refunded: [],
  credited: [],
  forfeited: [],
  applied: ["verified"],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
