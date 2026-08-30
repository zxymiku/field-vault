import { useState } from "react";
import { useApp } from "../state/AppStore";
import { exportBackup, importBackup } from "../lib/backup";
import type { AccountRecord } from "../lib/vault";
import { importExternal } from "../lib/importers";
import { ArkButton, Field, Panel, SectionTitle } from "../ui/ark";

// Settings: appearance, behavior, security, backup.

export default function SettingsScreen() {
  const { settings, updateSettings, accounts, setAccounts, changePassword, resetVault, toast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [resetText, setResetText] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [exported, setExported] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitChangePassword() {
    setPwError(null);
    if (next.length < 8) {
      setPwError("新主密码至少 8 位 / MIN 8 CHARACTERS");
      return;
    }
    if (next !== confirm) {
      setPwError("两次输入不一致 / MISMATCH");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("主密码已更改 / PASSWORD CHANGED");
    } catch {
      setPwError("当前主密码不正确 / WRONG CURRENT PASSWORD");
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    if (backupPassword.length < 8) {
      toast("备份密码至少 8 位 / MIN 8 CHARACTERS");
      return;
    }
    setBusy(true);
    try {
      const text = await exportBackup(accounts, backupPassword);
      await navigator.clipboard.writeText(text).catch(() => undefined);
      setExported(text);
      toast("备份已生成并复制到剪贴板 / EXPORTED");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setImportError(null);
    setBusy(true);
    try {
      // own encrypted backup first, then external formats (Aegis/2FAS/Bitwarden)
      let list: AccountRecord[];
      let format = "";
      const trimmed = importText.trim();
      if (trimmed.includes("field-vault-backup-v1")) {
        list = await importBackup(trimmed, importPassword);
        format = "FIELD VAULT 备份";
      } else {
        const ext = importExternal(trimmed);
        list = ext.entries.map((u) => ({
          id: crypto.randomUUID(),
          style: u.style,
          issuer: u.issuer,
          account: u.account,
          secret: u.secret,
          type: u.type,
          algo: u.algo,
          digits: u.digits,
          period: u.period,
          counter: u.counter,
          createdAt: Date.now(),
        }));
        format = ext.format.toUpperCase();
      }
      await setAccounts([...accounts, ...list]);
      toast(`已导入 ${list.length} 个账户（${format}）/ IMPORTED`);
      setImportText("");
      setImportPassword("");
    } catch (e) {
      setImportError(
        e instanceof Error && e.message === "BACKUP_BAD_PASSWORD"
          ? "备份密码不正确 / WRONG BACKUP PASSWORD"
          : e instanceof Error && e.message === "UNSUPPORTED_FORMAT"
            ? "无法识别的格式——支持本应用备份、Aegis 明文导出、2FAS 未加密备份、Bitwarden JSON"
            : "文件无效或密码不正确 / INVALID FILE OR WRONG PASSWORD",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ark-view-enter settings-view">
      <span className="ark-ghost-num" aria-hidden="true">
        03
      </span>
      <SectionTitle index="03" cn="设置" en="SETTINGS" />

      <div className="settings-grid">
        <Panel head="APPEARANCE · 外观" brackets>
          <div className="settings-row">
            <span>
              配色模式 / THEME
              <span className="en-only">PAPER ↔ CHARCOAL</span>
            </span>
            <div className="row-gap">
              <ArkButton
                variant={settings.theme === "endfield" ? "primary" : "default"}
                onClick={() => void updateSettings({ theme: "endfield" })}
              >
                纸白 PAPER
              </ArkButton>
              <ArkButton
                variant={settings.theme === "endfield-dark" ? "primary" : "default"}
                onClick={() => void updateSettings({ theme: "endfield-dark" })}
              >
                炭黑 CHARCOAL
              </ArkButton>
            </div>
          </div>
        </Panel>

        <Panel head="BEHAVIOR · 行为" brackets>
          <label className="settings-row check-row">
            <input
              type="checkbox"
              checked={settings.trayEnabled}
              onChange={(e) => void updateSettings({ trayEnabled: e.target.checked })}
            />
            <span>
              系统托盘常驻（关闭窗口时隐藏到托盘）
              <span className="en-only"> / STAY IN SYSTEM TRAY</span>
            </span>
          </label>
          <div className="settings-row">
            <span>
              窗口置顶（悬浮在其他窗口之上）
              <span className="en-only"> / ALWAYS ON TOP</span>
            </span>
            <label className="check-row">
              <input
                type="checkbox"
                aria-label="窗口置顶 / ALWAYS ON TOP"
                checked={settings.alwaysOnTop}
                onChange={(e) => void updateSettings({ alwaysOnTop: e.target.checked })}
              />
            </label>
          </div>
          <div className="settings-row">
            <span>
              自动锁定（分钟无操作后锁回加密库，0 = 不启用）
              <span className="en-only"> / AUTO-LOCK AFTER IDLE (MINUTES)</span>
            </span>
            <input
              className="ark-field__input settings-num"
              type="number"
              min={0}
              max={240}
              value={settings.autoLockMinutes}
              onChange={(e) =>
                void updateSettings({ autoLockMinutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })
              }
            />
          </div>
          <div className="settings-row">
            <span>
              复制后清空剪贴板（秒，0 = 不清空）
              <span className="en-only"> / CLIPBOARD AUTO-CLEAR (SECONDS)</span>
            </span>
            <input
              className="ark-field__input settings-num"
              type="number"
              min={0}
              max={300}
              value={settings.clipboardClearSeconds}
              onChange={(e) =>
                void updateSettings({
                  clipboardClearSeconds: Math.max(0, Math.min(300, Number(e.target.value) || 0)),
                })
              }
            />
          </div>
        </Panel>

        <Panel head="SECURITY · 安全" brackets>
          <p className="hint">
            修改主密码仅对加密模式生效。忘记密码且无恢复密钥时，只能重置保险库。
            <span className="en-only"> / ENCRYPTED MODE ONLY</span>
          </p>
          <div className="stack">
            <div className="bind-grid__row">
              <Field
                label="当前主密码 / CURRENT"
                type="password"
                mono
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <Field label="新主密码 / NEW" type="password" mono value={next} onChange={(e) => setNext(e.target.value)} />
              <Field
                label="确认新密码 / CONFIRM"
                type="password"
                mono
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {pwError && (
              <p className="form-error" role="alert">
                {pwError}
              </p>
            )}
            <div className="row-gap">
              <ArkButton onClick={() => void submitChangePassword()} disabled={busy}>
                修改主密码 / CHANGE PASSWORD
              </ArkButton>
            </div>
          </div>
          <div className="settings-row settings-row--danger">
            <span>
              重置保险库（删除全部数据并重新初始化）
              <span className="en-only"> / RESET VAULT — DESTRUCTIVE</span>
            </span>
            <div className="row-gap">
              <input
                className="ark-field__input settings-num settings-num--wide"
                placeholder="输入 RESET 确认"
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
              />
              <ArkButton
                variant="danger"
                disabled={resetText !== "RESET" || busy}
                onClick={() => {
                  void resetVault();
                }}
              >
                重置 / RESET
              </ArkButton>
            </div>
          </div>
        </Panel>

        <Panel head="BACKUP · 备份" brackets>
          <div className="stack">
            <div className="bind-grid__row">
              <Field
                label="备份密码 / BACKUP PASSWORD"
                type="password"
                mono
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
              />
              <div className="row-gap settings-align-end">
                <ArkButton
                  variant="primary"
                  onClick={() => void doExport()}
                  disabled={busy || accounts.length === 0}
                >
                  导出并复制 / EXPORT
                </ArkButton>
              </div>
            </div>
            {exported != null && (
              <p className="hint">
                备份 JSON 已复制到剪贴板（{String(exported.length)} 字符），请粘贴保存为文件。
                <span className="en-only"> / PASTE IT INTO A FILE</span>
              </p>
            )}
            <Field
              label="导入 JSON（本应用备份 / Aegis 明文 / 2FAS 未加密 / Bitwarden）"
              mono
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="bind-grid__row">
              <Field
                label="备份密码 / BACKUP PASSWORD"
                type="password"
                mono
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
              />
              <div className="row-gap settings-align-end">
                <ArkButton onClick={() => void doImport()} disabled={busy || importText === ""}>
                  导入 / IMPORT
                </ArkButton>
              </div>
            </div>
            {importError && (
              <p className="form-error" role="alert">
                {importError}
              </p>
            )}
          </div>
        </Panel>

        <Panel head="ABOUT · 关于" brackets>
          <p className="hint">
            FIELD VAULT 0.1.0 · 场站验证库 — TOTP/HOTP 桌面验证器（Tauri 2 + React）。
            <span className="en-only"> / DESKTOP 2FA AUTHENTICATOR — ENDFIELD × MAXIMAL</span>
          </p>
        </Panel>
      </div>
    </div>
  );
}
