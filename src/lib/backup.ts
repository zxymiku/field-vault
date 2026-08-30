// Encrypted backup export/import — a password-protected snapshot of all
// accounts, used for migration and for the forgot-password recovery path.

import {
  PBKDF2_ITERATIONS,
  aesDecrypt,
  aesEncrypt,
  deriveKey,
  fromB64,
  randomBytes,
  toB64,
  utf8Decode,
  utf8Encode,
} from "./crypto";
import { normalizeAccounts, type AccountRecord } from "./vault";

export interface BackupFile {
  format: "field-vault-backup-v1";
  kdf: { iterations: number; hash: "SHA-256"; salt: string };
  data: { iv: string; ct: string };
}

export async function exportBackup(accounts: AccountRecord[], password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(utf8Encode(password), salt, PBKDF2_ITERATIONS);
  const data = await aesEncrypt(key, utf8Encode(JSON.stringify(normalizeAccounts(accounts))));
  const file: BackupFile = {
    format: "field-vault-backup-v1",
    kdf: { iterations: PBKDF2_ITERATIONS, hash: "SHA-256", salt: toB64(salt) },
    data,
  };
  return JSON.stringify(file, null, 2);
}

export async function importBackup(text: string, password: string): Promise<AccountRecord[]> {
  const file = JSON.parse(text) as BackupFile;
  if (file.format !== "field-vault-backup-v1") throw new Error("BACKUP_FORMAT");
  const key = await deriveKey(utf8Encode(password), fromB64(file.kdf.salt), file.kdf.iterations);
  const plain = await aesDecrypt(key, file.data.iv, file.data.ct).catch(() => {
    throw new Error("BACKUP_BAD_PASSWORD");
  });
  return normalizeAccounts(JSON.parse(utf8Decode(plain)) as AccountRecord[]);
}
