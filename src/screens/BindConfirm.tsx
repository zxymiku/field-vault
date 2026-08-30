import { useState } from "react";
import { useApp } from "../state/AppStore";
import { base32Decode } from "../lib/base32";
import { newId, type AccountRecord } from "../lib/vault";
import type { OtpUri } from "../lib/otpauth";
import type { Algo, OtpType } from "../lib/otp";
import { ArkButton, Field, Panel } from "../ui/ark";

// Bind confirmation: edit recognized fields before committing to the vault.

export default function BindConfirm(props: {
  candidates: OtpUri[];
  onCancel: () => void;
  onSaved: (count: number) => void;
}) {
  const { accounts, setAccounts, toast } = useApp();
  const first = props.candidates[0];
  const [issuer, setIssuer] = useState(first.issuer);
  const [account, setAccount] = useState(first.account);
  const [secret, setSecret] = useState(first.secret);
  const [type, setType] = useState<OtpType>(first.type);
  const [algo, setAlgo] = useState<Algo>(first.algo);
  const [digits, setDigits] = useState(String(first.digits));
  const [period, setPeriod] = useState(String(first.period));
  const [counter, setCounter] = useState(String(first.counter ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isBatch = props.candidates.length > 1;

  function toRecord(u: OtpUri, overrides?: Partial<OtpUri>): AccountRecord {
    const merged = { ...u, ...overrides };
    return {
      id: newId(),
      issuer: merged.issuer,
      account: merged.account,
      secret: merged.secret.toUpperCase(),
      type: merged.type,
      algo: merged.algo,
      digits: merged.digits,
      period: merged.type === "totp" ? merged.period : 30,
      counter: merged.type === "hotp" ? (merged.counter ?? 0) : undefined,
      createdAt: Date.now(),
    };
  }

  async function saveOne() {
    setError(null);
    try {
      base32Decode(secret);
    } catch {
      setError("密钥不是有效的 Base32 / INVALID BASE32 SECRET");
      return;
    }
    setBusy(true);
    try {
      const rec = toRecord(first, {
        issuer,
        account,
        secret,
        type,
        algo,
        digits: Number(digits) === 8 ? 8 : 6,
        period: Number(period) || 30,
        counter: Number(counter) || 0,
      });
      await setAccounts([...accounts, rec]);
      toast(`已绑定 ${rec.issuer || rec.account} / BOUND`);
      props.onSaved(1);
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    setBusy(true);
    try {
      const recs = props.candidates.map((u) => toRecord(u));
      await setAccounts([...accounts, ...recs]);
      toast(`已绑定 ${recs.length} 个账户 / BOUND`);
      props.onSaved(recs.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ark-view-enter">
      <Panel
        head={`BIND · 绑定确认${isBatch ? ` · 识别到 ${props.candidates.length} 个账户` : ""}`}
        brackets
        raised
      >
        {isBatch ? (
          <div className="stack">
            <p className="hint">
              这是迁移码（Google Authenticator 导出），包含多个账户，可一键全部添加。
              <span className="en-only"> / MIGRATION QR — ADD ALL</span>
            </p>
            <ul className="batch-list">
              {props.candidates.map((c, i) => (
                <li key={i}>
                  <strong>{c.issuer || "未命名"}</strong>
                  <span> · {c.account || "(无账户名)"}</span>
                  <span className="ark-chip">{c.type === "hotp" ? "HOTP" : "TOTP"}</span>
                </li>
              ))}
            </ul>
            <div className="row-gap">
              <ArkButton variant="primary" onClick={() => void saveAll()} disabled={busy}>
                全部添加 / ADD ALL
              </ArkButton>
              <ArkButton onClick={props.onCancel} disabled={busy}>
                取消 / CANCEL
              </ArkButton>
            </div>
          </div>
        ) : (
          <div className="stack bind-grid">
            <div className="bind-grid__row">
              <label className="ark-field">
                <span className="ark-field__label">类型 / TYPE</span>
                <select className="ark-field__input" value={type} onChange={(e) => setType(e.target.value as OtpType)}>
                  <option value="totp">TOTP（时间型）</option>
                  <option value="hotp">HOTP（计数型）</option>
                </select>
              </label>
              <Field label="机构 / ISSUER" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            </div>
            <Field label="账户 / ACCOUNT" value={account} onChange={(e) => setAccount(e.target.value)} />
            <Field label="密钥 / SECRET (BASE32)" mono value={secret} onChange={(e) => setSecret(e.target.value)} />
            <div className="bind-grid__row">
              <label className="ark-field">
                <span className="ark-field__label">算法 / ALGORITHM</span>
                <select className="ark-field__input" value={algo} onChange={(e) => setAlgo(e.target.value as Algo)}>
                  <option value="SHA1">SHA-1</option>
                  <option value="SHA256">SHA-256</option>
                  <option value="SHA512">SHA-512</option>
                </select>
              </label>
              <label className="ark-field">
                <span className="ark-field__label">位数 / DIGITS</span>
                <select className="ark-field__input" value={digits} onChange={(e) => setDigits(e.target.value)}>
                  <option value="6">6</option>
                  <option value="8">8</option>
                </select>
              </label>
              {type === "totp" ? (
                <Field label="周期（秒）/ PERIOD" mono value={period} onChange={(e) => setPeriod(e.target.value)} />
              ) : (
                <Field label="初始计数 / COUNTER" mono value={counter} onChange={(e) => setCounter(e.target.value)} />
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="row-gap">
              <ArkButton variant="primary" onClick={() => void saveOne()} disabled={busy}>
                绑定 / BIND
              </ArkButton>
              <ArkButton onClick={props.onCancel} disabled={busy}>
                取消 / CANCEL
              </ArkButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
