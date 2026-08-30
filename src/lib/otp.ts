// RFC 4226 (HOTP) and RFC 6238 (TOTP) via WebCrypto HMAC.

export type Algo = "SHA1" | "SHA256" | "SHA512";
export type OtpType = "totp" | "hotp";

import { base32Decode } from "./base32";

async function hmacSha(secret: Uint8Array, message: Uint8Array, algo: Algo): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: `SHA-${algo.slice(3)}` as "SHA-1" | "SHA-256" | "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, message as BufferSource);
  return new Uint8Array(sig);
}

function dynamicTruncate(mac: Uint8Array, digits: number): string {
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

function counterMessage(counter: number): Uint8Array {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c % 256;
    c = Math.floor(c / 256);
  }
  return msg;
}

export async function hotp(
  secretB32: string,
  counter: number,
  algo: Algo = "SHA1",
  digits: number = 6,
): Promise<string> {
  const mac = await hmacSha(base32Decode(secretB32), counterMessage(counter), algo);
  return dynamicTruncate(mac, digits);
}

export async function totp(
  secretB32: string,
  nowMs: number,
  period: number,
  algo: Algo = "SHA1",
  digits: number = 6,
): Promise<string> {
  return hotp(secretB32, Math.floor(nowMs / 1000 / period), algo, digits);
}

/** Seconds left before the current TOTP window rolls over. */
export function secondsRemaining(nowMs: number, period: number): number {
  return period - Math.floor(nowMs / 1000) % period;
}
