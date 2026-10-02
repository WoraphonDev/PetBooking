import { createCanTransition } from "./canTransition.ts";

export const STATES = ["draft", "pending_review", "sent"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  draft: ["pending_review", "sent"],
  pending_review: ["sent"],
  sent: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
