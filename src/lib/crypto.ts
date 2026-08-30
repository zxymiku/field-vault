// Vault cryptography: PBKDF2 (600k, SHA-256) → AES-256-GCM.
// Dual key slots: a random master key DK encrypts the account data;
// DK is wrapped separately under the password slot and the recovery
// slot, so a forgotten password can be re-keyed from the recovery key.

import { base32Encode, groupBase32 } from "./base32";

export const PBKDF2_ITERATIONS = 600_000;

export interface KeySlot {
  id: "password" | "recovery";
  salt: string; // b64
  iv: string; // b64
  wrapped: string; // b64 AES-GCM(DK)
}

export interface EncryptedVaultFile {
  format: "field-vault-v1";
  encrypted: true;
  kdf: { iterations: number; hash: "SHA-256" };
  slots: KeySlot[];
  data: { iv: string; ct: string }; // b64 AES-GCM(DK, accounts JSON)
}

/* ---------- byte helpers ---------- */
export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- primitives ---------- */
export async function deriveKey(secret: Uint8Array, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<{ iv: string; ct: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource);
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function aesDecrypt(key: CryptoKey, ivB64: string, ctB64: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
    key,
    fromB64(ctB64) as BufferSource,
  );
  return new Uint8Array(pt);
}

/* ---------- recovery key: 160 bits, base32, 4-char groups ---------- */
export function generateRecoveryKey(): string {
  return groupBase32(base32Encode(randomBytes(20)));
}

export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

/* ---------- slot operations ---------- */
async function wrapDk(slotSecret: Uint8Array, slotSalt: Uint8Array, dk: Uint8Array, id: KeySlot["id"]): Promise<KeySlot> {
  const key = await deriveKey(slotSecret, slotSalt, PBKDF2_ITERATIONS);
  const { iv, ct } = await aesEncrypt(key, dk);
  return { id, salt: toB64(slotSalt), iv, wrapped: ct };
}

async function unwrapDk(slot: KeySlot, slotSecret: Uint8Array): Promise<Uint8Array> {
  const key = await deriveKey(slotSecret, fromB64(slot.salt), PBKDF2_ITERATIONS);
  return aesDecrypt(key, slot.iv, slot.wrapped);
}

function slotOf(file: EncryptedVaultFile, id: KeySlot["id"]): KeySlot {
  const slot = file.slots.find((s) => s.id === id);
  if (!slot) throw new Error("SLOT_MISSING");
  return slot;
}

/* ---------- vault file lifecycle ---------- */
export async function createEncryptedVault(
  accountsJson: string,
  password: string,
): Promise<{ file: EncryptedVaultFile; recoveryKey: string }> {
  const dk = randomBytes(32);
  const pwSalt = randomBytes(16);
  const pwKey = await deriveKey(enc.encode(password), pwSalt, PBKDF2_ITERATIONS);
  const pwWrapped = await aesEncrypt(pwKey, dk);

  const recoveryRaw = randomBytes(20);
  const recSalt = randomBytes(16);
  const recoverySlot = await wrapDk(recoveryRaw, recSalt, dk, "recovery");

  const dataKey = await crypto.subtle.importKey("raw", dk as BufferSource, "AES-GCM", false, ["encrypt"]);
  const data = await aesEncrypt(dataKey, enc.encode(accountsJson));

  const file: EncryptedVaultFile = {
    format: "field-vault-v1",
    encrypted: true,
    kdf: { iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    slots: [
      { id: "password", salt: toB64(pwSalt), iv: pwWrapped.iv, wrapped: pwWrapped.ct },
      recoverySlot,
    ],
    data,
  };
  return { file, recoveryKey: groupBase32(base32Encode(recoveryRaw)) };
}

export async function unlockWithPassword(file: EncryptedVaultFile, password: string): Promise<Uint8Array> {
  const slot = slotOf(file, "password");
  return unwrapDk(slot, enc.encode(password)).catch(() => {
    throw new Error("BAD_PASSWORD");
  });
}

export async function unlockWithRecovery(file: EncryptedVaultFile, recoveryInput: string): Promise<Uint8Array> {
  const slot = slotOf(file, "recovery");
  return unwrapDk(slot, fromB64Safe(normalizeRecoveryKey(recoveryInput))).catch(() => {
    throw new Error("BAD_RECOVERY");
  });
}

function fromB64Safe(b32: string): Uint8Array {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of b32) {
    const idx = A.indexOf(ch);
    if (idx < 0) throw new Error("BAD_RECOVERY");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function decryptAccounts(file: EncryptedVaultFile, dk: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", dk as BufferSource, "AES-GCM", false, ["decrypt"]);
  return dec.decode(await aesDecrypt(key, file.data.iv, file.data.ct));
}

export async function reencryptData(file: EncryptedVaultFile, dk: Uint8Array, accountsJson: string): Promise<EncryptedVaultFile> {
  const key = await crypto.subtle.importKey("raw", dk as BufferSource, "AES-GCM", false, ["encrypt"]);
  return { ...file, data: await aesEncrypt(key, enc.encode(accountsJson)) };
}

/** Re-wrap the password slot under a new password (keep data untouched). */
export async function changePasswordSlot(
  file: EncryptedVaultFile,
  dk: Uint8Array,
  newPassword: string,
): Promise<EncryptedVaultFile> {
  const salt = randomBytes(16);
  const slot = await wrapDk(enc.encode(newPassword), salt, dk, "password");
  return { ...file, slots: [slot, ...file.slots.filter((s) => s.id !== "password")] };
}

export function utf8Encode(s: string): Uint8Array {
  return enc.encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return dec.decode(b);
}
