// Minimal QR Code encoder (ISO/IEC 18004) for the R-30 PromptPay payload: byte mode, error correction M,
// versions 1–10 (≤ 213 bytes — a PromptPay payload is ~90). No dependency; tests decode the result with jsQR.

/** ECC level M per version 1–10: [ec codewords per block, [blocks, data codewords per block][]] */
const ECC_M: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [
    22,
    [
      [2, 38],
      [2, 39],
    ],
  ],
  [
    22,
    [
      [3, 36],
      [2, 37],
    ],
  ],
  [
    26,
    [
      [4, 43],
      [1, 44],
    ],
  ],
];
const ALIGNMENT: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];
const MAX_VERSION = ECC_M.length;

const dataCapacity = (version: number) => (ECC_M[version - 1]?.[1] ?? []).reduce((n, [blocks, len]) => n + blocks * len, 0);
/** byte-mode character-count field: 8 bits up to version 9, 16 from version 10 */
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** GF(256) multiply, primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMul(coef, factor);
    });
  }
  return result;
}

/** data codewords → interleaved data + error-correction codewords */
function codewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, bit) => (v << 1) | bit, 0));
  for (let pad = 0xec; data.length < dataCapacity(version); pad ^= 0xec ^ 0x11) data.push(pad);

  const [ecLen, groups] = ECC_M[version - 1] as (typeof ECC_M)[number];
  const divisor = rsDivisor(ecLen);
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (const [count, len] of groups)
    for (let b = 0; b < count; b++) {
      const chunk = data.slice(offset, offset + len);
      offset += len;
      blocks.push({ data: chunk, ec: rsRemainder(chunk, divisor) });
    }
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i] ?? 0);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i] ?? 0);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Matrix {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];
  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  /** (x = column, y = row) */
  fn(x: number, y: number, dark: boolean) {
    (this.modules[y] as boolean[])[x] = dark;
    (this.isFunction[y] as boolean[])[x] = true;
  }
  get(x: number, y: number) {
    return this.modules[y]?.[x] ?? false;
  }
}

function drawFunctionPatterns(m: Matrix, version: number) {
  const { size } = m;
  for (let i = 0; i < size; i++) {
    m.fn(6, i, i % 2 === 0);
    m.fn(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const [x, y] = [cx + dx, cy + dy];
        if (x >= 0 && x < size && y >= 0 && y < size) m.fn(x, y, dist !== 2 && dist !== 4);
      }
  const pos = ALIGNMENT[version - 1] ?? [];
  const last = pos.length - 1;
  for (const [i, cx] of pos.entries())
    for (const [j, cy] of pos.entries()) {
      // the three corners already hold finder patterns
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m.fn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  drawFormat(m, 0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m.fn(a, b, bit);
      m.fn(b, a, bit);
    }
  }
}

/** format information for ECC M (bits 00) and the mask, both copies + the dark module */
function drawFormat(m: Matrix, mask: number) {
  const data = (0 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const { size } = m;
  for (let i = 0; i <= 5; i++) m.fn(8, i, bit(i));
  m.fn(8, 7, bit(6));
  m.fn(8, 8, bit(7));
  m.fn(7, 8, bit(8));
  for (let i = 9; i < 15; i++) m.fn(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) m.fn(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) m.fn(8, size - 15 + i, bit(i));
  m.fn(8, size - 8, true);
}

function drawCodewords(m: Matrix, data: number[]) {
  const { size } = m;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!m.isFunction[y]?.[x] && i < data.length * 8) {
          (m.modules[y] as boolean[])[x] = (((data[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }
}

function applyMask(m: Matrix, mask: number) {
  const test = MASKS[mask] as (typeof MASKS)[number];
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) if (!m.isFunction[y]?.[x] && test(x, y)) (m.modules[y] as boolean[])[x] = !m.get(x, y);
}

/** lower is better (rules N1–N4) */
function penalty(m: Matrix): number {
  const { size } = m;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    const s = Array.from({ length: size }, (_, i) => (get(i) ? "1" : "0")).join("");
    score += 40 * (s.match(/(?=10111010000|00001011101)/g) ?? []).length;
  };
  for (let k = 0; k < size; k++) {
    line((i) => m.get(i, k));
    line((i) => m.get(k, i));
  }
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = m.get(x, y);
      if (c === m.get(x + 1, y) && c === m.get(x, y + 1) && c === m.get(x + 1, y + 1)) score += 3;
    }
  const dark = m.modules.flat().filter(Boolean).length;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** smallest version (1–10) whose ECC-M byte capacity fits `length` bytes */
export function versionFor(length: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) if (4 + countBits(v) + length * 8 <= dataCapacity(v) * 8) return v;
  throw new RangeError(`QR payload too long: ${length} bytes`);
}

/** QR modules (true = dark), row by row, without the quiet zone */
export function encodeQr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  const data = codewords(bytes, version);
  let best: boolean[][] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < MASKS.length; mask++) {
    const m = new Matrix(17 + 4 * version);
    drawFunctionPatterns(m, version);
    drawCodewords(m, data);
    applyMask(m, mask);
    drawFormat(m, mask);
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = m.modules.map((row) => [...row]);
    }
  }
  return best as boolean[][];
}

/** one SVG path ("M x y h1 v1 h-1 z" per dark module), offset by the quiet zone */
export function qrPath(modules: boolean[][], quiet = 4): string {
  const parts: string[] = [];
  for (const [y, row] of modules.entries())
    for (const [x, dark] of row.entries()) if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
  return parts.join("");
}
