import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppStore";
import { hotp, secondsRemaining, steamCode, totp } from "../lib/otp";
import { adapter } from "../lib/tauri";
import { ArkButton, CodeReadout, Icon, Panel, SectionTitle } from "../ui/ark";
import type { AccountRecord } from "../lib/vault";

interface CodeState {
  code: string;
  progress: number | null; // totp only
  critical: boolean;
}

function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Resolve all codes; re-runs on every ticker beat (cheap HMAC, small lists). */
function useVaultCodes(accounts: AccountRecord[], now: number): Map<string, CodeState> {
  const [codes, setCodes] = useState<Map<string, CodeState>>(new Map());

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = new Map<string, CodeState>();
      for (const a of accounts) {
        if (a.type === "hotp") {
          let code = "—";
          try {
            code = await hotp(a.secret, a.counter ?? 0, a.algo, a.digits);
          } catch {
            code = "ERR";
          }
          next.set(a.id, { code, progress: null, critical: false });
        } else {
          const remaining = secondsRemaining(now, a.period);
          let code = "……";
          try {
            code =
              a.style === "steam"
                ? await steamCode(a.secret, now, a.period)
                : await totp(a.secret, now, a.period, a.algo, a.digits);
          } catch {
            code = "ERR";
          }
          next.set(a.id, { code, progress: remaining / a.period, critical: remaining <= 5 });
        }
      }
      if (alive) setCodes(next);
    })();
    return () => {
      alive = false;
    };
  }, [accounts, now]);

  return codes;
}

export default function VaultScreen(props: { onScan: () => void; onOpen: (a: AccountRecord) => void }) {
  const { accounts, settings, toast, setAccounts } = useApp();
  const now = useNow();
  const codes = useVaultCodes(accounts, now);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.issuer.toLowerCase().includes(q) || a.account.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  async function copyCode(a: AccountRecord) {
    const state = codes.get(a.id);
    if (state == null || state.code === "……" || state.code === "ERR") return;
    await adapter.copyText(state.code);
    setCopiedId(a.id);
    toast(`已复制 ${state.code} / COPIED`);
    if (settings.clipboardClearSeconds > 0) {
      window.setTimeout(() => {
        void adapter.clearClipboard();
        setCopiedId((id) => (id === a.id ? null : id));
      }, settings.clipboardClearSeconds * 1000);
    }
  }

  async function advanceHotp(a: AccountRecord) {
    const next = accounts.map((x) =>
      x.id === a.id ? { ...x, counter: (x.counter ?? 0) + 1 } : x,
    );
    await setAccounts(next);
  }

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ia = a.issuer + a.account;
        const ib = b.issuer + b.account;
        return ia.localeCompare(ib, "zh-Hans-CN");
      }),
    [filtered],
  );

  return (
    <div className="ark-view-enter vault-view">
      <span className="ark-ghost-num" aria-hidden="true">
        01
      </span>
      <SectionTitle index="01" cn="验证器库" en="AUTHENTICATOR VAULT" />

      <div className="vault-toolbar">
        <input
          className="ark-field__input vault-search"
          placeholder="搜索机构或账户 / SEARCH"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索账户 / SEARCH"
        />
        <ArkButton variant="primary" icon="scan" onClick={props.onScan}>
          扫描绑定
        </ArkButton>
      </div>

      {sorted.length === 0 ? (
        <Panel className="vault-empty" brackets>
          <p className="vault-empty__title">
            {accounts.length === 0 ? "保险库为空" : "没有匹配的账户"}
          </p>
          <p className="hint">
            {accounts.length === 0
              ? "通过扫描台扫描二维码，绑定你的第一台验证器。"
              : "调整搜索关键词后重试。"}
          </p>
          <span className="en-only">
            {accounts.length === 0
              ? "EMPTY VAULT — SCAN A QR CODE TO BIND YOUR FIRST AUTHENTICATOR"
              : "NO MATCH — ADJUST THE SEARCH"}
          </span>
          {accounts.length === 0 && (
            <ArkButton variant="primary" icon="scan" onClick={props.onScan}>
              前往扫描台
            </ArkButton>
          )}
        </Panel>
      ) : (
        <ul className="acct-list" aria-label="验证器列表 / AUTHENTICATORS">
          {sorted.map((a, i) => {
            const state = codes.get(a.id);
            const critical = state?.critical ?? false;
            return (
              <li
                key={a.id}
                className="acct-row acct-row--clickable"
                data-critical={critical ? "true" : undefined}
                onClick={() => props.onOpen(a)}
                onKeyDown={(e) => e.key === "Enter" && props.onOpen(a)}
                tabIndex={0}
                role="button"
                aria-label={`打开 ${a.issuer} 详情`}
              >
                <span className="acct-row__idx" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="acct-row__id">
                  <span className="acct-row__issuer">{a.issuer || "未命名 / UNNAMED"}</span>
                  <span className="acct-row__account">{a.account}</span>
                </div>
                <div className="acct-row__meta">
                  <span className="ark-chip">{a.type === "hotp" ? `HOTP #${a.counter ?? 0}` : a.style === "steam" ? "STEAM" : `${a.period}s`}</span>
                  {copiedId === a.id && <span className="ark-chip ark-chip--state">已复制</span>}
                </div>
                {state != null && (
                  <CodeReadout code={state.code} progress={state.progress ?? 0} critical={critical && a.type === "totp"} />
                )}
                {a.type === "hotp" && (
                  <button type="button" className="acct-row__advance" aria-label="递增计数器 / NEXT CODE"
                    title="递增计数器 / NEXT CODE" onClick={() => void advanceHotp(a)}>
                    <Icon name="plus" />
                  </button>
                )}
                <button type="button" className="acct-row__copy" aria-label={`打开 ${a.issuer} 详情`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onOpen(a);
                  }}>
                  <Icon name="edit" />
                </button>
                <button type="button" className="acct-row__copy" aria-label={`复制验证码 ${a.issuer}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyCode(a);
                  }}>
                  <Icon name="copy" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
