// R-30 — PromptPay QR payload (EMVCo TLV) for a direct transfer to the shop (04#R-30). No gateway involved.

const AID = "A000000677010111";
const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 upper-case hex digits */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** proxy sub-tag and value of tag 29, or null when the id has the wrong shape */
function proxy(type: "phone" | "national_id" | "tax_id" | "ewallet", digits: string): string | null {
  switch (type) {
    // 3. phone: 10 digits starting with 0 → 0066 + 9 digits
    case "phone":
      return /^0\d{9}$/.test(digits) ? tlv("01", `0066${digits.slice(1)}`) : null;
    case "national_id":
    case "tax_id":
      return /^\d{13}$/.test(digits) ? tlv("02", digits) : null;
    case "ewallet":
      return /^\d{15}$/.test(digits) ? tlv("03", digits) : null;
  }
}

export function promptPayPayload(input: {
  type: "phone" | "national_id" | "tax_id" | "ewallet";
  id: string;
  amountSatang?: number | null;
}): { payload: string } | { error: "INVALID_PROMPTPAY_ID" } {
  // 3. keep digits only
  const account = proxy(input.type, input.id.replace(/\D/g, ""));
  if (account === null) return { error: "INVALID_PROMPTPAY_ID" };
  const amount = input.amountSatang ?? null;
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0))
    throw new RangeError(`amountSatang must be a non-negative integer: ${amount}`);
  const hasAmount = amount !== null && amount > 0;

  // 1. header, dynamic (12) when an amount is set, static (11) otherwise, merchant account
  let payload = `000201${hasAmount ? "010212" : "010211"}${tlv("29", tlv("00", AID) + account)}`;
  // 2. currency THB, amount "baht.satang", country, then CRC over everything including "6304"
  payload += "5303764";
  if (hasAmount) payload += tlv("54", `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`);
  payload += "5802TH6304";
  return { payload: payload + crc16(payload) };
}
