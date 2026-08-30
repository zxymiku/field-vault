import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { decryptAccounts, unlockWithPassword, unlockWithRecovery } from "../lib/crypto";
import type { EncryptedVaultFile } from "../lib/crypto";
import {
  createEncryptedVault,
  isEncryptedFile,
  loadVaultFile,
  masterKeyToB64,
  normalizeAccounts,
  rekeyPassword,
  saveEncryptedAccounts,
  writePlaintextVault,
  writeVaultFile,
  type AccountRecord,
  type VaultFile,
} from "../lib/vault";
import { adapter } from "../lib/tauri";

/* ---------- settings ---------- */
export interface Settings {
  theme: "endfield" | "endfield-dark";
  trayEnabled: boolean;
  clipboardClearSeconds: number;
  autoLockMinutes: number; // 0 = off
  alwaysOnTop: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "endfield",
  trayEnabled: true,
  clipboardClearSeconds: 15,
  autoLockMinutes: 0,
  alwaysOnTop: false,
};

interface StoredSettings extends Settings {
  format: "fv-settings-v1";
}

/* ---------- phase machine ----------
   loading → setup (no vault file) | ready (plaintext vault)
   locked → ready (password) | rekey (recovery key → new password) */
export type Phase = "loading" | "setup" | "locked" | "rekey" | "ready";

interface AppContextValue {
  phase: Phase;
  settings: Settings;
  accounts: AccountRecord[];
  setAccounts: (next: AccountRecord[]) => Promise<void>;
  createVault: (mode: "encrypted" | "plaintext", password: string, recoveryKey?: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  unlockWithRecoveryKey: (recovery: string) => Promise<void>;
  completeRekey: (newPassword: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  resetVault: () => Promise<void>;
  lock: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStore missing");
  return v;
}

export function AppProvider(props: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accounts, setAccountsState] = useState<AccountRecord[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Sensitive runtime state, kept outside the React render path.
  const vaultRef = useRef<VaultFile | null>(null);
  const masterKeyRef = useRef<Uint8Array | null>(null);

  const applySettings = useCallback((s: Settings) => {
    document.documentElement.setAttribute("data-ark-theme", s.theme);
    void adapter.setTrayEnabled(s.trayEnabled).catch(() => undefined);
    void adapter.setAlwaysOnTop(s.alwaysOnTop).catch(() => undefined);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  const boot = useCallback(async () => {
    const [settingsRaw, file] = await Promise.all([
      adapter.readSettings(),
      loadVaultFile().catch(() => null),
    ]);

    let s = DEFAULT_SETTINGS;
    if (settingsRaw != null) {
      try {
        const parsed = JSON.parse(settingsRaw) as StoredSettings;
        if (parsed.format === "fv-settings-v1") {
          s = {
            theme: parsed.theme === "endfield-dark" ? "endfield-dark" : "endfield",
            trayEnabled: parsed.trayEnabled,
            clipboardClearSeconds: parsed.clipboardClearSeconds,
            autoLockMinutes: Math.max(0, Number(parsed.autoLockMinutes) || 0),
            alwaysOnTop: parsed.alwaysOnTop === true,
          };
        }
      } catch {
        /* fall back to defaults */
      }
    }
    setSettings(s);
    applySettings(s);

    if (file == null) {
      vaultRef.current = null;
      setPhase("setup");
      return;
    }
    vaultRef.current = file;
    if (!isEncryptedFile(file)) {
      setAccountsState(normalizeAccounts(file.accounts));
      setPhase("ready");
    } else {
      setPhase("locked");
    }
  }, [applySettings]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const lastActiveRef = useRef(Date.now());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const markActive = () => {
      lastActiveRef.current = Date.now();
    };
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive);
    window.addEventListener("click", markActive);
    const timer = window.setInterval(() => {
      const s = settingsRef.current;
      const minutes = s.autoLockMinutes;
      if (minutes <= 0) return;
      if (phaseRef.current !== "ready") return;
      const file = vaultRef.current;
      if (file == null || !isEncryptedFile(file)) return; // plaintext never locks
      if (Date.now() - lastActiveRef.current >= minutes * 60_000) {
        masterKeyRef.current = null;
        setAccountsState([]);
        setPhase("locked");
      }
    }, 15_000);
    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("click", markActive);
      window.clearInterval(timer);
    };
  }, []);

  const persistAccounts = useCallback(async (next: AccountRecord[]) => {
    const file = vaultRef.current;
    if (file == null) return;
    if (isEncryptedFile(file)) {
      if (masterKeyRef.current == null) throw new Error("LOCKED");
      const updated = await saveEncryptedAccounts(file, masterKeyToB64(masterKeyRef.current), next);
      vaultRef.current = updated;
    } else {
      await writePlaintextVault(next);
    }
    setAccountsState(next);
  }, []);

  const setAccounts = useCallback(
    async (next: AccountRecord[]) => {
      await persistAccounts(normalizeAccounts(next));
    },
    [persistAccounts],
  );

  const createVault = useCallback(async (mode: "encrypted" | "plaintext", password: string, recoveryKey?: string) => {
    if (mode === "plaintext") {
      const file: VaultFile = { format: "field-vault-v1", encrypted: false, accounts: [] };
      await writeVaultFile(file);
      vaultRef.current = file;
      masterKeyRef.current = null;
      setAccountsState([]);
    } else {
      const { file } = await createEncryptedVault([], password, recoveryKey);
      await writeVaultFile(file);
      vaultRef.current = file;
      masterKeyRef.current = await unlockWithPassword(file, password);
      setAccountsState([]);
    }
    setPhase("ready");
  }, []);

  const unlock = useCallback(async (password: string) => {
    const file = vaultRef.current;
    if (file == null || !isEncryptedFile(file)) return;
    const dk = await unlockWithPassword(file, password);
    masterKeyRef.current = dk;
    setAccountsState(normalizeAccounts(JSON.parse(await decryptAccounts(file, dk)) as AccountRecord[]));
    setPhase("ready");
  }, []);

  const unlockWithRecoveryKey = useCallback(async (recovery: string) => {
    const file = vaultRef.current;
    if (file == null || !isEncryptedFile(file)) return;
    const dk = await unlockWithRecovery(file, recovery);
    masterKeyRef.current = dk;
    setAccountsState(normalizeAccounts(JSON.parse(await decryptAccounts(file, dk)) as AccountRecord[]));
    setPhase("rekey");
  }, []);

  const completeRekey = useCallback(async (newPassword: string) => {
    const file = vaultRef.current;
    if (file == null || !isEncryptedFile(file) || masterKeyRef.current == null) return;
    const updated: EncryptedVaultFile = await rekeyPassword(
      file,
      masterKeyToB64(masterKeyRef.current),
      newPassword,
    );
    vaultRef.current = updated;
    setPhase("ready");
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const file = vaultRef.current;
    if (file == null || !isEncryptedFile(file)) throw new Error("PLAINTEXT_MODE");
    await unlockWithPassword(file, current); // verify; throws BAD_PASSWORD
    const dk = masterKeyRef.current ?? (await unlockWithPassword(file, current));
    const updated = await rekeyPassword(file, masterKeyToB64(dk), next);
    vaultRef.current = updated;
    masterKeyRef.current = dk;
  }, []);

  const resetVault = useCallback(async () => {
    await adapter.deleteVault().catch(() => undefined);
    vaultRef.current = null;
    masterKeyRef.current = null;
    setAccountsState([]);
    setPhase("setup");
  }, []);

  const lock = useCallback(() => {
    const file = vaultRef.current;
    if (file != null && isEncryptedFile(file)) {
      masterKeyRef.current = null;
      setAccountsState([]);
      setPhase("locked");
    }
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        applySettings(next);
        const stored: StoredSettings = { format: "fv-settings-v1", ...next };
        void adapter.writeSettings(JSON.stringify(stored)).catch(() => undefined);
        return next;
      });
    },
    [applySettings],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      phase,
      settings,
      accounts,
      setAccounts,
      createVault,
      unlock,
      unlockWithRecoveryKey,
      completeRekey,
      changePassword,
      resetVault,
      lock,
      updateSettings,
      toast,
      toastMsg,
    }),
    [phase, settings, accounts, setAccounts, createVault, unlock, unlockWithRecoveryKey, completeRekey, changePassword, resetVault, lock, updateSettings, toast, toastMsg],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
