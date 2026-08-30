import { AppProvider, useApp } from "./state/AppStore";
import SetupWizard from "./screens/SetupWizard";
import LockScreen from "./screens/LockScreen";
import { ArkShell } from "./ui/ark";

function ShellPlaceholder() {
  const { settings, lock } = useApp();
  return (
    <ArkShell
      title="FIELD VAULT · 场站验证库"
      meta={<>SYS 0.1.0 · {settings.theme === "endfield-dark" ? "CHARCOAL" : "PAPER"}</>}
      nav={[
        { id: "vault", icon: "vault", label: "验证器库 / VAULT" },
        { id: "scan", icon: "scan", label: "扫描台 / SCANNER" },
        { id: "settings", icon: "settings", label: "设置 / SETTINGS" },
      ]}
      active="vault"
      onNavigate={() => {}}
      baseline={
        <>
          <span className="ark-baseline__sig" aria-hidden="true" />
          <span>VAULT ONLINE</span>
          <span>AWAITING SCREENS — PR6+</span>
        </>
      }
      dock={
        <button type="button" aria-label="锁定 / LOCK" title="锁定 / LOCK" onClick={lock}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <rect x="5" y="10.5" width="14" height="9.5" />
            <path d="M8 10.5V8a4 4 0 018 0v2.5" />
          </svg>
        </button>
      }
    >
      <p>主屏内容于后续 PR 落地。</p>
    </ArkShell>
  );
}

function Root() {
  const { phase, toastMsg } = useApp();
  if (phase === "loading") {
    return <main className="lock-stage" aria-busy="true" />;
  }
  return (
    <>
      {phase === "setup" && <SetupWizard />}
      {phase === "locked" && <LockScreen />}
      {phase === "rekey" && <LockScreen />}
      {phase === "ready" && <ShellPlaceholder />}
      {toastMsg != null && (
        <output className="ark-toast" role="status">
          {toastMsg}
        </output>
      )}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
