import { useState } from "react";
import { useApp } from "../state/AppStore";
import { base32Decode } from "../lib/base32";
import type { AccountRecord } from "../lib/vault";
import type { Algo, OtpType } from "../lib/otp";
import { ArkButton, Field, Icon, Panel } from "../ui/ark";

// Per-account dossier: inspect, edit, reveal secret, delete (two-step).

export default function AccountDetail(props: { account: AccountRecord; onClose: () => void }) {
  const { accounts, setAccounts, toast } = useApp();
  const [issuer, setIssuer] = useState(props.account.issuer);
  const [account, setAccount] = useState(props.account.account);
  const [type, setType] = useState<OtpType>(props.account.type);
  const [algo, setAlgo] = useState<Algo>(props.account.algo);
  const [digits, setDigits] = useState(String(props.account.digits));
  const [period, setPeriod] = useState(String(props.account.period));
  const [counter, setCounter] = useState(String(props.account.counter ?? 0));
  const [reveal, setReveal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    try {
      base32Decode(props.account.secret);
    } catch {
      setError("原密钥损坏，无法保存 / SECRET CORRUPT");
      return;
    }
    setBusy(true);
    try {
      const next = accounts.map((a) =>
        a.id === props.account.id
          ? {
              ...a,
              issuer,
              account,
              type,
              algo,
              digits: Number(digits) === 8 ? 8 : 6,
              period: Number(period) || 30,
              counter: Number(counter) || 0,
            }
          : a,
      );
      await setAccounts(next);
      toast("已保存 / SAVED");
      props.onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await setAccounts(accounts.filter((a) => a.id !== props.account.id));
      toast("已删除 / DELETED");
      props.onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ark-modal" role="dialog" aria-modal="true" aria-label="账户详情 / ACCOUNT DETAIL">
      <button type="button" className="ark-modal__shade" aria-label="关闭 / CLOSE" onClick={props.onClose} />
      <div className="ark-modal__panel">
        <Panel
          head={`DOSSIER · ${props.account.issuer || "未命名"}`}
          brackets
          raised
          headRight={
            <button type="button" className="ark-modal__close" onClick={props.onClose} aria-label="关闭 / CLOSE">
              ✕
            </button>
          }
        >
          <div className="stack bind-grid">
            <div className="bind-grid__row">
              <Field label="机构 / ISSUER" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
              <Field label="账户 / ACCOUNT" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div className="bind-grid__row">
              <label className="ark-field">
                <span className="ark-field__label">类型 / TYPE</span>
                <select className="ark-field__input" value={type} onChange={(e) => setType(e.target.value as OtpType)}>
                  <option value="totp">TOTP</option>
                  <option value="hotp">HOTP</option>
                </select>
              </label>
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
                <Field label="周期 / PERIOD" mono value={period} onChange={(e) => setPeriod(e.target.value)} />
              ) : (
                <Field label="计数 / COUNTER" mono value={counter} onChange={(e) => setCounter(e.target.value)} />
              )}
            </div>
            <div className="secret-line">
              <span className="ark-field__label">密钥 / SECRET (BASE32)</span>
              <div className="secret-line__row">
                <code className={`secret-line__value${reveal ? "" : " secret-line__value--masked"}`}>
                  {reveal ? props.account.secret : "•••• •••• ••••"}
                </code>
                <button
                  type="button"
                  className="acct-row__copy"
                  aria-label={reveal ? "隐藏密钥 / HIDE" : "显示密钥 / REVEAL"}
                  onClick={() => setReveal((r) => !r)}
                >
                  <Icon name="eye" />
                </button>
              </div>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="row-gap">
              <ArkButton variant="primary" onClick={() => void save()} disabled={busy}>
                保存 / SAVE
              </ArkButton>
              <ArkButton variant="danger" onClick={() => void remove()} disabled={busy}>
                {confirmDelete ? "确认删除？" : "删除 / DELETE"}
              </ArkButton>
              <ArkButton onClick={props.onClose}>关闭 / CLOSE</ArkButton>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
