/** Pure membership check; endpoint guards and persistence belong to the caller. */
export function createCanTransition<State extends string>(transitions: Record<State, State[]>) {
  return (from: string, to: string): boolean => Object.hasOwn(transitions, from) && transitions[from as State].includes(to as State);
}
