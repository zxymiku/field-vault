import { useState } from "react";
import { useApp } from "../state/AppStore";
import { ArkButton, Field, Panel, SectionTitle } from "../ui/ark";

// First-run wizard: choose storage mode → set password → record recovery key.

export default function SetupWizard() {
  const { createVault, toast } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseStorage(next: "encrypted" | "plaintext") {
    if (next === "plaintext") {
      setBusy(true);
      try {
        await createVault("plaintext", "");
        toast("保险库已就绪 / VAULT READY");
      } finally {
        setBusy(false);
      }
      return;
    }
    setStep(2);
  }

  async function submitPassword() {
    setError(null);
    if (password.length < 8) {
      setError("主密码至少 8 位 / MIN 8 CHARACTERS");
      return;
    }
    if (password !== confirm) {
      setError("两次输入不一致 / MISMATCH");
      return;
    }
    setBusy(true);
    try {
      const { generateRecoveryKey } = await import("../lib/crypto");
      setRecovery(generateRecoveryKey());
      setStep(3);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!saved) {
      setError("请先确认已妥善保存恢复密钥 / CONFIRM BACKUP");
      return;
    }
    setBusy(true);
    try {
      await createVault("encrypted", password);
      toast("保险库已创建 / VAULT CREATED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lock-stage">
      <span className="ark-ghost-num" aria-hidden="true">
        00
      </span>
      <div className="lock-card ark-reveal" data-visible="true">
        <SectionTitle index="00" cn="初始化场站" en="FIRST-RUN SETUP" />

        {step === 1 && (
          <Panel head="STEP 1 / 选择存储模式 · STORAGE MODE" brackets raised>
            <div className="mode-grid">
              <button type="button" className="mode-card" onClick={() => void chooseStorage("encrypted")}>
                <strong>主密码加密</strong>
                <span className="mode-card__en">ENCRYPTED VAULT</span>
                <p>PBKDF2 + AES-256-GCM 加密存储。可随时修改密码；忘记密码可用恢复密钥重设。推荐。</p>
                <span className="mode-card__tag">推荐 / RECOMMENDED</span>
              </button>
              <button type="button" className="mode-card" onClick={() => void chooseStorage("plaintext")}>
                <strong>明文本地存储</strong>
                <span className="mode-card__en">PLAINTEXT VAULT</span>
                <p>无解锁流程、启动即用。但本机任何程序都能读取全部 2FA 密钥，请确认风险。</p>
                <span className="mode-card__tag mode-card__tag--warn">有风险 / AT RISK</span>
              </button>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel head="STEP 2 / 设定主密码 · MASTER PASSWORD" brackets raised>
            <div className="stack">
              <Field
                label="主密码 / PASSWORD"
                type="password"
                mono
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <Field
                label="确认主密码 / CONFIRM"
                type="password"
                mono
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="row-gap">
                <ArkButton variant="primary" onClick={() => void submitPassword()} disabled={busy}>
                  生成恢复密钥
                </ArkButton>
                <ArkButton onClick={() => setStep(1)} disabled={busy}>
                  返回 / BACK
                </ArkButton>
              </div>
            </div>
          </Panel>
        )}

        {step === 3 && recovery != null && (
          <Panel head="STEP 3 / 记录恢复密钥 · RECOVERY KEY" brackets raised>
            <p className="hint">
              忘记主密码时，这是唯一能重新打开保险库的手段。请离线抄写保存（仅显示这一次）。
              <span className="en-only"> / SHOWN ONCE — STORE IT OFFLINE</span>
            </p>
            <code className="recovery-key">{recovery}</code>
            <label className="check-row">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              我已将恢复密钥妥善保存 / I HAVE STORED THE KEY
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <ArkButton variant="primary" onClick={() => void finish()} disabled={busy}>
              创建保险库 / CREATE VAULT
            </ArkButton>
          </Panel>
        )}
      </div>
    </main>
  );
}
