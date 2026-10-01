// `{var}` substitution for the stub templates. Placeholders without a payload value render empty (Q-0010).
export function fill(text: string, payload: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = payload[name];
    return v === undefined ? "" : String(v);
  });
}
