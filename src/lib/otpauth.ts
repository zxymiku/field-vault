// otpauth:// URI parsing + Google Authenticator migration QR
// (otpauth-migration://, minimal protobuf reader).

import type { Algo, OtpType } from "./otp";

export interface OtpUri {
  style?: "default" | "steam";
  issuer: string;
  account: string;
  secret: string;
  type: OtpType;
  algo: Algo;
  digits: number;
  period: number;
  counter?: number;
}

function clampDigits(v: number | undefined): number {
  return v === 8 ? 8 : 6;
}

function algoOf(v: string | undefined): Algo {
  const u = v?.toUpperCase();
  return u === "SHA256" || u === "SHA512" ? u : "SHA1";
}

/** Parse a single otpauth:// URI. Throws with a stable error code. */
export function parseOtpUri(raw: string): OtpUri {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("QR_NOT_URI");
  }
  const type = url.host === "hotp" ? "hotp" : url.host === "totp" ? "totp" : null;
  if (!type) throw new Error("QR_BAD_TYPE");

  const params = url.searchParams;
  const secret = (params.get("secret") ?? "").replace(/\s/g, "");
  if (!secret) throw new Error("QR_NO_SECRET");

  // Label: /Issuer:account — issuer may also arrive via ?issuer=
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const colon = label.indexOf(":");
  let issuer = params.get("issuer") ?? "";
  let account = label;
  if (colon > 0) {
    const labelIssuer = label.slice(0, colon).trim();
    if (!issuer) issuer = labelIssuer;
    account = label.slice(colon + 1).trim();
  }

  const period = Math.max(1, Number(params.get("period") ?? 30) || 30);
  const counterRaw = params.get("counter");
  return {
    type,
    issuer,
    account,
    secret: secret.toUpperCase(),
    algo: algoOf(params.get("algorithm") ?? undefined),
    digits: clampDigits(Number(params.get("digits") ?? 6) || 6),
    period: type === "totp" ? period : 30,
    counter: type === "hotp" ? (counterRaw != null ? Number(counterRaw) || 0 : 0) : undefined,
  };
}

/* ---------- otpauth-migration:// (protobuf, field 1 = repeated OtpParameters) */

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  let p = pos;
  for (;;) {
    if (p >= buf.length) throw new Error("QR_MALFORMED");
    const b = buf[p++];
    result += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result, p];
}

/** Split a protobuf message into [fieldNumber, wireType, value] triples. */
function* fields(buf: Uint8Array): Generator<[number, number, Uint8Array | number]> {
  let p = 0;
  while (p < buf.length) {
    let tag: number;
    [tag, p] = readVarint(buf, p);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      let v: number;
      [v, p] = readVarint(buf, p);
      yield [field, wire, v];
    } else if (wire === 2) {
      let len: number;
      [len, p] = readVarint(buf, p);
      if (p + len > buf.length) throw new Error("QR_MALFORMED");
      yield [field, wire, buf.subarray(p, p + len)];
      p += len;
    } else {
      throw new Error("QR_MALFORMED");
    }
  }
}

const MIG_ALGO: Record<number, Algo> = { 1: "SHA1", 2: "SHA256", 3: "SHA512" };
const MIG_DIGITS: Record<number, number> = { 1: 6, 2: 8 };
const MIG_TYPE: Record<number, OtpType> = { 1: "hotp", 2: "totp" };

function b32Encode(bytes: Uint8Array): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31];
  return out;
}

/** Parse a Google Authenticator migration payload into standard OtpUris. */
export function parseMigrationUri(raw: string): OtpUri[] {
  const data = new URL(raw.trim()).searchParams.get("data");
  if (!data) throw new Error("QR_MALFORMED");
  const buf = b64urlDecode(data);

  const out: OtpUri[] = [];
  for (const [field, wire, value] of fields(buf)) {
    if (field !== 1 || wire !== 2 || typeof value === "number") continue;
    const p = value as Uint8Array;
    let secret = new Uint8Array();
    let name = "";
    let issuer = "";
    let algo = "SHA1" as Algo;
    let digits = 6;
    let type: OtpType = "totp";
    let counter = 0;
    for (const [f, w, v] of fields(p)) {
      if (w === 2 && typeof v !== "number") {
        const s = new TextDecoder().decode(v as Uint8Array);
        if (f === 1) secret = v as Uint8Array;
        if (f === 2) name = s;
        if (f === 3) issuer = s;
      } else if (w === 0 && typeof v === "number") {
        if (f === 4) algo = MIG_ALGO[v] ?? "SHA1";
        if (f === 5) digits = MIG_DIGITS[v] ?? 6;
        if (f === 6) type = MIG_TYPE[v] ?? "totp";
        if (f === 7) counter = v;
      }
    }
    if (secret.length === 0) continue;
    const colon = name.indexOf(":");
    if (colon > 0 && !issuer) {
      issuer = name.slice(0, colon).trim();
    }
    out.push({
      type,
      issuer,
      account: colon > 0 ? name.slice(colon + 1).trim() : name,
      secret: b32Encode(secret).toUpperCase(),
      algo,
      digits,
      period: 30,
      counter: type === "hotp" ? counter : undefined,
    });
  }
  if (out.length === 0) throw new Error("QR_MALFORMED");
  return out;
}

/** Steam Guard style when the issuer/account smells like Steam/Valve. */
export function markSteamStyle(list: OtpUri[]): OtpUri[] {
  return list.map((u) =>
    /steam|valve/i.test(u.issuer) ? { ...u, style: "steam" as const } : u,
  );
}

export function looksLikeOtp(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith("otpauth://") || t.startsWith("otpauth-migration://");
}

/** Dispatch: single URI or migration batch. */
export function parseAnyOtp(text: string): OtpUri[] {
  const t = text.trim();
  if (t.toLowerCase().startsWith("otpauth-migration://")) return parseMigrationUri(t);
  if (t.toLowerCase().startsWith("otpauth://")) return [parseOtpUri(t)];
  throw new Error("QR_NOT_URI");
}
