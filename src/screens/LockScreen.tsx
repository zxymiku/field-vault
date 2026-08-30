import { useState } from "react";
import { useApp } from "../state/AppStore";
import { ArkButton, Field, Panel } from "../ui/ark";

// Unlock gate: password by default, recovery key when the password is lost.
// Recovery unlock forces an immediate password re-key before entering.

type Tab = "password" | "recovery";

export default function LockScreen() {
  const { unlock, unlockWithRecoveryKey, completeRekey, phase } = useApp();
  const [tab, setTab] = useState<Tab>("password");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitUnlock() {
    setError(null);
    setBusy(true);
    try {
      await unlock(password);
    } catch {
      setError("主密码不正确 / WRONG PASSWORD");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery() {
    setError(null);
    setBusy(true);
    try {
      await unlockWithRecoveryKey(recovery);
    } catch {
      setError("恢复密钥不正确 / WRONG RECOVERY KEY");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword() {
    setError(null);
    if (newPassword.length < 8) {
      setError("主密码至少 8 位 / MIN 8 CHARACTERS");
      return;
    }
    if (newPassword !== confirm) {
      setError("两次输入不一致 / MISMATCH");
      return;
    }
    setBusy(true);
    try {
      await completeRekey(newPassword);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "rekey") {
    return (
      <main className="lock-stage">
        <span className="ark-ghost-num" aria-hidden="true">
          RE
        </span>
        <div className="lock-card ark-reveal" data-visible="true">
          <header className="ark-section">
            <span className="ark-section__index" aria-hidden="true">
              RE<sup>/</sup>
            </span>
            <div className="ark-section__names">
              <h1 className="ark-section__cn">重设主密码</h1>
              <span className="ark-section__en">RESET MASTER PASSWORD</span>
            </div>
            <span className="ark-section__rule" aria-hidden="true" />
          </header>
          <Panel head="RECOVERY · 已通过恢复密钥验证" brackets raised>
            <div className="stack">
              <Field label="新主密码 / NEW PASSWORD" type="password" mono value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} autoFocus />
              <Field label="确认新主密码 / CONFIRM" type="password" mono value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
              {error && <p className="form-error" role="alert">{error}</p>}
              <ArkButton variant="primary" onClick={() => void submitNewPassword()} disabled={busy}>
                重设并解锁 / RESET &amp; UNLOCK
              </ArkButton>
            </div>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="lock-stage">
      <span className="ark-ghost-num" aria-hidden="true">
        00
      </span>
      <div className="lock-card ark-reveal" data-visible="true">
        <header className="ark-section">
          <span className="ark-section__index" aria-hidden="true">
            FV<sup>/</sup>
          </span>
          <div className="ark-section__names">
            <h1 className="ark-section__cn">场站验证库已锁定</h1>
            <span className="ark-section__en">FIELD VAULT — LOCKED</span>
          </div>
          <span className="ark-section__rule" aria-hidden="true" />
        </header>

        <Panel head={tab === "password" ? "ACCESS · 主密码解锁" : "ACCESS · 恢复密钥解锁"} brackets raised>
          {tab === "password" ? (
            <div className="stack">
              <Field label="主密码 / PASSWORD" type="password" mono value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitUnlock()} autoFocus />
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="row-gap">
                <ArkButton variant="primary" onClick={() => void submitUnlock()} disabled={busy}>
                  解锁 / UNLOCK
                </ArkButton>
                <ArkButton onClick={() => { setTab("recovery"); setError(null); }}>
                  忘记密码？
                </ArkButton>
              </div>
            </div>
          ) : (
            <div className="stack">
              <p className="hint">
                输入初始化时保存的恢复密钥（含连字符）。验证通过后需设置新主密码。
                <span className="en-only"> / RECOVERY KEY → RE-KEY</span>
              </p>
              <Field label="恢复密钥 / RECOVERY KEY" mono value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitRecovery()} autoFocus />
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="row-gap">
                <ArkButton variant="primary" onClick={() => void submitRecovery()} disabled={busy}>
                  验证 / VERIFY
                </ArkButton>
                <ArkButton onClick={() => { setTab("password"); setError(null); }}>
                  返回 / BACK
                </ArkButton>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
