// Tauri adapter with a browser fallback. When the app runs in a plain
// browser (dev/QA), files map to localStorage so the UI stays testable.

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

function lsGet(key: string): string | null {
  return localStorage.getItem(key);
}

function lsSet(key: string, value: string): void {
  localStorage.setItem(key, value);
}

export const adapter = {
  readVault: (): Promise<string | null> =>
    isTauri ? invoke<string | null>("read_vault") : Promise.resolve(lsGet("fv.vault")),

  writeVault: (contents: string): Promise<void> =>
    isTauri ? invoke("write_vault", { contents }) : Promise.resolve(lsSet("fv.vault", contents)),

  deleteVault: (): Promise<void> =>
    isTauri ? invoke("delete_vault") : Promise.resolve(lsSet("fv.vault", "")),

  readSettings: (): Promise<string | null> =>
    isTauri ? invoke<string | null>("read_settings") : Promise.resolve(lsGet("fv.settings")),

  writeSettings: (contents: string): Promise<void> =>
    isTauri ? invoke("write_settings", { contents }) : Promise.resolve(lsSet("fv.settings", contents)),

  copyText: async (text: string): Promise<void> => {
    if (isTauri) {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
  },

  clearClipboard: async (): Promise<void> => {
    if (isTauri) {
      try {
        const { clear } = await import("@tauri-apps/plugin-clipboard-manager");
        await clear();
      } catch {
        /* older runtimes may not support clear */
      }
    } else if (navigator.clipboard.writeText) {
      await navigator.clipboard.writeText("");
    }
  },

  setTrayEnabled: (enabled: boolean): Promise<void> =>
    isTauri ? invoke("set_tray_enabled", { enabled }) : Promise.resolve(),
};
