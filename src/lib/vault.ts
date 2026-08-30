// Vault model + persistence. Two storage modes chosen at first run:
// encrypted (password + recovery slots) or plaintext (explicit opt-in).

import type { EncryptedVaultFile } from "./crypto";
import {
  changePasswordSlot,
  createEncryptedVault as createEnc,
  decryptAccounts,
  reencryptData,
  unlockWithPassword,
  unlockWithRecovery,
} from "./crypto";
import { adapter } from "./tauri";
import type { Algo, OtpType } from "./otp";

export interface AccountRecord {
  id: string;
  style?: "default" | "steam";
  issuer: string;
  account: string;
  secret: string; // base32
  type: OtpType;
  algo: Algo;
  digits: number;
  period: number;
  counter?: number; // hotp
  createdAt: number;
}

export type { EncryptedVaultFile };

export interface PlaintextVaultFile {
  format: "field-vault-v1";
  encrypted: false;
  accounts: AccountRecord[];
}

export type VaultFile = EncryptedVaultFile | PlaintextVaultFile;

export function isEncryptedFile(f: VaultFile | null): f is EncryptedVaultFile {
  return f != null && f.encrypted === true;
}

export function newId(): string {
  return crypto.randomUUID();
}

/* ---------- raw IO ---------- */
export async function loadVaultFile(): Promise<VaultFile | null> {
  const raw = await adapter.readVault();
  if (raw == null) return null;
  const parsed = JSON.parse(raw) as VaultFile;
  if (parsed.format !== "field-vault-v1") throw new Error("VAULT_FORMAT");
  return parsed;
}

export async function writeVaultFile(file: VaultFile): Promise<void> {
  await adapter.writeVault(JSON.stringify(file));
}

/* ---------- lifecycle operations ---------- */
export async function createEncryptedVault(
  accounts: AccountRecord[],
  password: string,
  recoveryKeyInput?: string,
): Promise<{ file: EncryptedVaultFile; recoveryKey: string }> {
  return createEnc(JSON.stringify(accounts), password, recoveryKeyInput);
}

export async function writePlaintextVault(accounts: AccountRecord[]): Promise<void> {
  await writeVaultFile({ format: "field-vault-v1", encrypted: false, accounts });
}

export async function decryptWithPassword(file: EncryptedVaultFile, password: string): Promise<AccountRecord[]> {
  const dk = await unlockWithPassword(file, password);
  return JSON.parse(await decryptAccounts(file, dk)) as AccountRecord[];
}

export async function decryptWithRecovery(file: EncryptedVaultFile, recovery: string): Promise<AccountRecord[]> {
  const dk = await unlockWithRecovery(file, recovery);
  return JSON.parse(await decryptAccounts(file, dk)) as AccountRecord[];
}

/** Persist accounts into an existing encrypted file under its master key. */
export async function saveEncryptedAccounts(
  file: EncryptedVaultFile,
  masterKeyB64: string,
  accounts: AccountRecord[],
): Promise<EncryptedVaultFile> {
  const updated = await reencryptData(file, dkFromB64(masterKeyB64), JSON.stringify(accounts));
  await writeVaultFile(updated);
  return updated;
}

function dkFromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function masterKeyToB64(dk: Uint8Array): string {
  return btoa(String.fromCharCode(...dk));
}

export function masterKeyFromB64(b64: string): Uint8Array {
  return dkFromB64(b64);
}

/** Convert a plaintext vault to encrypted in place (setup wizard path). */
export async function convertPlaintextToEncrypted(
  accounts: AccountRecord[],
  password: string,
): Promise<{ file: EncryptedVaultFile; recoveryKey: string }> {
  return createEnc(JSON.stringify(accounts), password);
}

/** Re-key the password slot after a successful unlock. */
export async function rekeyPassword(
  file: EncryptedVaultFile,
  masterKeyB64: string,
  newPassword: string,
): Promise<EncryptedVaultFile> {
  const updated = await changePasswordSlot(file, dkFromB64(masterKeyB64), newPassword);
  await writeVaultFile(updated);
  return updated;
}

/* ---------- account helpers ---------- */
export function normalizeAccounts(list: AccountRecord[]): AccountRecord[] {
  const seen = new Set<string>();
  const out: AccountRecord[] = [];
  for (const a of list) {
    const key = `${a.issuer}|${a.account}|${a.secret}|${a.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
