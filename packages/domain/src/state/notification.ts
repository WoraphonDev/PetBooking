import { createCanTransition } from "./canTransition.ts";

export const STATES = ["queued", "sent", "failed", "skipped"] as const;
type State = (typeof STATES)[number];
export const ALLOWED_TRANSITIONS: Record<State, State[]> = {
  queued: ["sent", "failed", "skipped"],
  sent: [],
  failed: [],
  skipped: [],
};

export const canTransition = createCanTransition(ALLOWED_TRANSITIONS);
