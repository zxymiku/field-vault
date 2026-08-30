import { useEffect, useState } from "react";
import { ArkButton, ArkShell, CodeReadout, Panel, SectionTitle } from "./ui/ark";

// Design-system check page — real screens land from PR5 onward.
export default function App() {
  const [progress, setProgress] = useState(0.7);
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p <= 0 ? 1 : p - 0.01)), 300);
    return () => clearInterval(t);
  }, []);

  return (
    <ArkShell
      title="FIELD VAULT · 场站验证库"
      meta={<>SYS 0.1.0 · DESIGN CHECK</>}
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
          <span>TOTP SYNC</span>
        </>
      }
      dock={
        <button type="button" aria-label="锁定 / LOCK" title="锁定 / LOCK">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <rect x="5" y="10.5" width="14" height="9.5" />
            <path d="M8 10.5V8a4 4 0 018 0v2.5" />
          </svg>
        </button>
      }
    >
      <div className="ark-view-enter">
        <span className="ark-ghost-num" aria-hidden="true">01</span>
        <SectionTitle index="01" cn="设计系统验证" en="DESIGN SYSTEM CHECK" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", maxWidth: 880 }}>
          <Panel head="READOUT · 验证码仪表" brackets raised>
            <CodeReadout code="482916" progress={progress} critical={progress < 0.2} />
          </Panel>
          <Panel head="CONTROLS · 控件">
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <ArkButton variant="primary">扫描绑定</ArkButton>
              <ArkButton>复制</ArkButton>
              <ArkButton variant="danger">删除</ArkButton>
              <ArkButton disabled>禁用</ArkButton>
            </div>
          </Panel>
        </div>
      </div>
    </ArkShell>
  );
}
