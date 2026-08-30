// RFC 4648 base32 (A-Z, 2-7) — decode with tolerance for spacing/case,
// and compact encode used for recovery keys.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET[i]] = i;

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s\-_=.]/g, "");
  if (clean.length === 0) throw new Error("SECRET_EMPTY");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = LOOKUP[ch];
    if (idx === undefined) throw new Error("SECRET_INVALID_CHAR");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Recovery-key presentation: groups of 4 joined by dashes. */
export function groupBase32(raw: string, group = 4): string {
  return raw.replace(/[\s\-_]/g, "").replace(new RegExp(`(.{${group}})`, "g"), "$1-").replace(/-$/, "");
}
