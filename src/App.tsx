import { AppProvider, useApp } from "./state/AppStore";
import SetupWizard from "./screens/SetupWizard";
import LockScreen from "./screens/LockScreen";
import VaultScreen from "./screens/VaultScreen";
import ScannerScreen from "./screens/ScannerScreen";
import SettingsScreen from "./screens/SettingsScreen";
import AccountDetail from "./screens/AccountDetail";
import { useState } from "react";
import { ArkShell, Icon } from "./ui/ark";

type View = "vault" | "scan" | "settings";

const NAV: { id: View; icon: "vault" | "scan" | "settings"; label: string }[] = [
  { id: "vault", icon: "vault", label: "验证器库 / VAULT" },
  { id: "scan", icon: "scan", label: "扫描台 / SCANNER" },
  { id: "settings", icon: "settings", label: "设置 / SETTINGS" },
];

function Shell() {
  const { settings, lock, toastMsg, accounts } = useApp();
  const [view, setView] = useState<View>("vault");
  const [openId, setOpenId] = useState<string | null>(null);
  const openAccount = accounts.find((a) => a.id === openId) ?? null;

  return (
    <>
      <ArkShell
        title="FIELD VAULT · 场站验证库"
        meta={<>SYS 0.1.0 · {settings.theme === "endfield-dark" ? "CHARCOAL" : "PAPER"}</>}
        nav={NAV}
        active={view}
        onNavigate={(id) => setView(id as View)}
        baseline={
          <>
            <span className="ark-baseline__sig" aria-hidden="true" />
            <span>VAULT ONLINE</span>
            <span>TOTP SYNC ACTIVE</span>
          </>
        }
        dock={
          <button type="button" aria-label="锁定 / LOCK" title="锁定 / LOCK" onClick={lock}>
            <Icon name="lock" />
          </button>
        }
      >
        {view === "vault" && <VaultScreen onScan={() => setView("scan")} onOpen={(a) => setOpenId(a.id)} />}
        {view === "scan" && <ScannerScreen onDone={() => setView("vault")} />}
        {view === "settings" && <SettingsScreen />}
      </ArkShell>
      {openAccount != null && <AccountDetail account={openAccount} onClose={() => setOpenId(null)} />}
      {toastMsg != null && (
        <output className="ark-toast" role="status">
          {toastMsg}
        </output>
      )}
    </>
  );
}

function Root() {
  const { phase } = useApp();
  if (phase === "loading") {
    return <main className="lock-stage" aria-busy="true" />;
  }
  if (phase === "setup") return <SetupWizard />;
  if (phase === "locked" || phase === "rekey") return <LockScreen />;
  return <Shell />;
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
