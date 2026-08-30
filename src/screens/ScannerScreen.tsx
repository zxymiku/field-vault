import { useCallback, useEffect, useRef, useState } from "react";
import { markSteamStyle, parseAnyOtp, type OtpUri } from "../lib/otpauth";
import { base32Decode } from "../lib/base32";
import type { OtpType } from "../lib/otp";
import { decodeFile, decodeVideoFrame, decodeVideoRegion } from "../lib/qr";
import BindConfirm from "./BindConfirm";
import { ArkButton, Icon, Panel, SectionTitle } from "../ui/ark";
import { adapter } from "../lib/tauri";
import { parseSteamAuthText } from "../lib/steam";

type Mode = "camera" | "image" | "screen" | "manual";

const MODES: { id: Mode; icon: "camera" | "image" | "monitor" | "edit"; cn: string; en: string }[] = [
  { id: "camera", icon: "camera", cn: "摄像头", en: "CAMERA" },
  { id: "image", icon: "image", cn: "扫描图片", en: "IMAGE" },
  { id: "screen", icon: "monitor", cn: "扫描屏幕", en: "SCREEN" },
  { id: "manual", icon: "edit", cn: "手动添加", en: "MANUAL" },
];

export default function ScannerScreen(props: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [candidates, setCandidates] = useState<OtpUri[] | null>(null);

  function handleResult(text: string) {
    try {
      setCandidates(markSteamStyle(parseAnyOtp(text)));
    } catch {
      // not an otpauth payload — keep scanning silently
    }
  }

  return (
    <div className="ark-view-enter scanner-view">
      <span className="ark-ghost-num" aria-hidden="true">
        02
      </span>
      <SectionTitle index="02" cn="扫描台" en="BINDING SCANNER" />

      {candidates == null && (
        <div className="scan-modes" role="tablist" aria-label="扫描方式 / SCAN MODE">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className="scan-mode-tab"
              data-active={mode === m.id ? "true" : undefined}
              onClick={() => setMode(m.id)}
            >
              <Icon name={m.icon} />
              <span>{m.cn}</span>
              <span className="scan-mode-tab__en">{m.en}</span>
            </button>
          ))}
        </div>
      )}

      {candidates != null ? (
        <BindConfirm
          candidates={candidates}
          onCancel={() => setCandidates(null)}
          onSaved={() => {
            setCandidates(null);
            setMode(null);
            props.onDone();
          }}
        />
      ) : mode === "camera" ? (
        <CameraScanner onResult={handleResult} onStop={() => setMode(null)} />
      ) : mode === "image" ? (
        <ImageScanner onResult={handleResult} />
      ) : mode === "screen" ? (
        <ScreenScanner onResult={handleResult} onStop={() => setMode(null)} />
      ) : mode === "manual" ? (
        <ManualEntry onCandidates={setCandidates} />
      ) : (
        <Panel head="STANDBY · 选择扫描方式" brackets>
          <p className="hint">摄像头 / 图片 / 屏幕三种来源都会汇入同一绑定确认表单。</p>
        </Panel>
      )}
    </div>
  );
}

/* ================= manual ================= */

// Text-secret path for Microsoft/Google style setups that only show the
// key as characters, plus direct otpauth:// URI paste.

function ManualEntry(props: { onCandidates: (list: OtpUri[]) => void }) {
  const [uriText, setUriText] = useState("");
  const [secret, setSecret] = useState("");
  const [issuer, setIssuer] = useState("");
  const [account, setAccount] = useState("");
  const [type, setType] = useState<OtpType>("totp");
  const [style, setStyle] = useState<"default" | "steam">("default");
  const [error, setError] = useState<string | null>(null);

  function parseUri() {
    setError(null);
    try {
      props.onCandidates(markSteamStyle(parseAnyOtp(uriText)));
    } catch {
      setError("不是有效的 otpauth 链接 / INVALID OTPAUTH URI");
    }
  }

  function submitFields() {
    setError(null);
    try {
      base32Decode(secret);
    } catch {
      setError("密钥不是有效的 Base32 / INVALID BASE32 SECRET");
      return;
    }
    props.onCandidates([
      {
        style,
        issuer,
        account,
        secret: secret.toUpperCase(),
        type: style === "steam" ? "totp" : type,
        algo: "SHA1",
        digits: style === "steam" ? 5 : 6,
        period: 30,
        counter: type === "hotp" ? 0 : undefined,
      },
    ]);
  }

  return (
    <Panel head="MANUAL · 手动添加" brackets raised>
      <div className="stack">
        <SteamImport onCandidates={props.onCandidates} />
        <div className="ark-section__rule" aria-hidden="true" />
        <label className="ark-field">
          <span className="ark-field__label">粘贴 otpauth 链接 / PASTE URI</span>
          <textarea
            className="ark-field__input manual-uri"
            rows={2}
            value={uriText}
            onChange={(e) => setUriText(e.target.value)}
            placeholder="otpauth://totp/..."
          />
        </label>
        <div className="row-gap">
          <ArkButton variant="primary" onClick={parseUri} disabled={uriText.trim() === ""}>
            解析链接 / PARSE
          </ArkButton>
        </div>
        <p className="hint">
          或直接填写文本密钥（Microsoft/Google 设置页会提供一串字母密钥）。
          <span className="en-only"> / OR ENTER THE TEXT SECRET</span>
        </p>
        <div className="bind-grid__row">
          <label className="ark-field">
            <span className="ark-field__label">风格 / STYLE</span>
            <select className="ark-field__input" value={style}
              onChange={(e) => setStyle(e.target.value as "default" | "steam")}>
              <option value="default">标准 / STANDARD</option>
              <option value="steam">Steam 令牌 / STEAM GUARD</option>
            </select>
          </label>
          <label className="ark-field">
            <span className="ark-field__label">类型 / TYPE</span>
            <select className="ark-field__input" value={type} onChange={(e) => setType(e.target.value as OtpType)}
              disabled={style === "steam"}>
              <option value="totp">TOTP</option>
              <option value="hotp">HOTP</option>
            </select>
          </label>
          <label className="ark-field">
            <span className="ark-field__label">机构 / ISSUER</span>
            <input className="ark-field__input" value={issuer} onChange={(e) => setIssuer(e.target.value)}
              placeholder="Microsoft / Google / Steam" />
          </label>
          <label className="ark-field">
            <span className="ark-field__label">账户 / ACCOUNT</span>
            <input className="ark-field__input" value={account} onChange={(e) => setAccount(e.target.value)} />
          </label>
        </div>
        <label className="ark-field">
          <span className="ark-field__label">密钥 / SECRET (BASE32)</span>
          <input className="ark-field__input ark-field__input--mono" value={secret}
            onChange={(e) => setSecret(e.target.value)} placeholder="JBSWY3DPEHPK3PXP" />
        </label>
        {error != null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <ArkButton variant="primary" onClick={submitFields} disabled={secret.trim() === ""}>
          生成绑定表单 / TO BIND FORM
        </ArkButton>
      </div>
    </Panel>
  );
}

/* ================= steam local import ================= */

interface SteamAuthEntryView {
  path: string;
  account_name: string;
  steam_id: string | null;
  source: string;
}

function SteamImport(props: { onCandidates: (list: OtpUri[]) => void }) {
  const [scanning, setScanning] = useState(false);
  const [entries, setEntries] = useState<SteamAuthEntryView[] | null>(null);
  const [localAccounts, setLocalAccounts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function importEntry(path: string) {
    setError(null);
    void (async () => {
      const text = await adapter.readSteamAuthFile(path);
      if (text == null) {
        setError("读取文件失败 / FAILED TO READ FILE");
        return;
      }
      try {
        props.onCandidates(parseSteamAuthText(text).map((e) => e.uri));
      } catch (e) {
        setError(
          e instanceof Error && e.message === "STEAM_ENCRYPTED"
            ? "该数据文件已加密——请先在原工具（SDA）中解密后重试"
            : "文件中未找到有效的共享密钥 / NO VALID SHARED SECRET",
        );
      }
    })();
  }

  function scan() {
    setError(null);
    setScanning(true);
    void (async () => {
      try {
        const raw = await adapter.scanSteamAuth();
        if (raw == null) {
          setEntries([]);
          setLocalAccounts(null);
          return;
        }
        const parsed = JSON.parse(raw) as {
          auth_files: SteamAuthEntryView[];
          local_accounts: { account_name: string }[];
        };
        setEntries(parsed.auth_files);
        setLocalAccounts(parsed.local_accounts.map((a) => a.account_name));
      } finally {
        setScanning(false);
      }
    })();
  }

  function importPicked(file: File) {
    void file.text().then((text) => {
      try {
        props.onCandidates(parseSteamAuthText(text).map((e) => e.uri));
      } catch (e) {
        setError(
          e instanceof Error && e.message === "STEAM_ENCRYPTED"
            ? "该数据文件已加密——请先在原工具（SDA）中解密后重试"
            : "文件中未找到有效的共享密钥 / NO VALID SHARED SECRET",
        );
      }
    });
  }

  return (
    <div className="stack steam-import">
      <p className="hint">
        官方 Steam 客户端不存储令牌密钥；本功能自动发现本机第三方桌面验证器（Steam Desktop Authenticator 的
        .maFile / steamguard-cli 的 steamguard.json）并导入。仅导入生成验证码所需的 shared_secret。
        <span className="en-only"> / SCAN LOCAL SDA / STEAMGUARD-CLI DATA — SHARED SECRET ONLY</span>
      </p>
      <div className="row-gap">
        <ArkButton variant="primary" icon="key" onClick={scan} disabled={scanning}>
          {scanning ? "扫描中… / SCANNING" : "自动扫描本机 / AUTO SCAN"}
        </ArkButton>
        <ArkButton onClick={() => fileRef.current?.click()}>选择文件 / PICK FILE</ArkButton>
        <input
          ref={fileRef}
          type="file"
          accept=".maFile,.json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f != null) importPicked(f);
            e.target.value = "";
          }}
        />
      </div>
      {localAccounts != null && localAccounts.length > 0 && (
        <p className="hint">
          本机 Steam 客户端登录过的账号：{localAccounts.join("、")}
          <span className="en-only"> / ACCOUNTS KNOWN TO THE LOCAL STEAM CLIENT</span>
        </p>
      )}
      {entries != null && entries.length > 0 && (
        <ul className="batch-list">
          {entries.map((en) => (
            <li key={en.path + en.account_name}>
              <strong>Steam</strong>
              <span> · {en.account_name}</span>
              {en.steam_id != null && <span className="steam-id"> · {en.steam_id.slice(0, 10)}…</span>}
              <span className="ark-chip">{en.source}</span>
              <ArkButton onClick={() => importEntry(en.path)}>导入 / IMPORT</ArkButton>
            </li>
          ))}
        </ul>
      )}
      {entries != null && entries.length === 0 && (
        <p className="hint">
          未在本机常见位置发现 Steam 验证器数据文件。若令牌只装在手机上，请先用 SDA 等工具在 PC
          上完成桌面验证器登记，或改用「手动添加」。
          <span className="en-only"> / NOTHING FOUND — SEE MANUAL ENTRY</span>
        </p>
      )}
      {error != null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ================= camera ================= */

function CameraScanner(props: { onResult: (text: string) => void; onStop: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current != null) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "videoinput"));

        timer = window.setInterval(() => {
          const v = videoRef.current;
          const c = scratchRef.current;
          if (v == null || c == null || v.readyState < 2) return;
          const text = decodeVideoFrame(v, c);
          if (text != null) props.onResult(text);
        }, 350);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError") {
          setError(
            "摄像头权限被拒绝。WebView2 一次拒绝后不会再次弹窗——需删除 %LOCALAPPDATA%\\com.zxymiku.fieldvault\\EBWebView 目录后重启应用。",
          );
        } else if (name === "NotFoundError") {
          setError("未检测到摄像头设备。可改用「扫描图片」或「扫描屏幕」。");
        } else {
          setError(`摄像头启动失败：${String(e)}`);
        }
      }
    })();

    return () => {
      alive = false;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId, props]);

  return (
    <Panel head="LIVE · 摄像头取景" brackets raised>
      {error != null ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <div className="scan-stage">
          <video ref={videoRef} className="scan-video" muted playsInline aria-label="摄像头取景" />
          <div className="scan-reticle" aria-hidden="true" />
        </div>
      )}
      {devices.length > 1 && error == null && (
        <label className="ark-field scan-device">
          <span className="ark-field__label">摄像头 / DEVICE</span>
          <select
            className="ark-field__input"
            value={deviceId ?? ""}
            onChange={(e) => setDeviceId(e.target.value || undefined)}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `摄像头 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <canvas ref={scratchRef} hidden />
      <div className="row-gap">
        <ArkButton onClick={props.onStop}>停止 / STOP</ArkButton>
      </div>
    </Panel>
  );
}

/* ================= image ================= */

function ImageScanner(props: { onResult: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const decode = useCallback(
    async (file: File | Blob) => {
      setBusy(true);
      setError(null);
      try {
        const text = await decodeFile(file);
        if (text == null) {
          setError("图片中未识别到二维码 / NO QR CODE FOUND");
          return;
        }
        props.onResult(text);
      } catch {
        setError("图片解码失败 / DECODE FAILED");
      } finally {
        setBusy(false);
      }
    },
    [props],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file != null) void decode(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [decode]);

  return (
    <Panel head="IMAGE · 图片识码" brackets raised>
      <div
        className={`dropzone${dragOver ? " dropzone--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file != null) void decode(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label="选择或拖入二维码图片"
      >
        <Icon name="image" />
        <p>拖入图片、点击选择，或直接 Ctrl+V 粘贴截图</p>
        <span className="en-only"> / DROP · CLICK · PASTE</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f != null) void decode(f);
          e.target.value = "";
        }}
      />
      {busy && <p className="hint">识别中 / DECODING…</p>}
      {error != null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}

/* ================= screen ================= */

function ScreenScanner(props: { onResult: (text: string) => void; onStop: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  // region in container-relative px; null = full-frame scan
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const scan = useCallback(() => {
    const v = videoRef.current;
    const c = scratchRef.current;
    const stage = stageRef.current;
    if (v == null || c == null || stage == null || v.readyState < 2) return;
    if (rect == null) {
      const text = decodeVideoFrame(v, c);
      if (text != null) props.onResult(text);
      return;
    }
    const scale = v.videoWidth / stage.clientWidth || 1;
    const text = decodeVideoRegion(v, c, {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      w: Math.round(rect.w * scale),
      h: Math.round(rect.h * scale),
    });
    if (text != null) props.onResult(text);
  }, [rect, props]);

  const start = useCallback(async () => {
    setError(null);
    try {
      // requires transient user activation — always called from a click
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (videoRef.current != null) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => setActive(false));
      setActive(true);
    } catch {
      setError("屏幕捕获已取消或不可用 / SCREEN CAPTURE UNAVAILABLE");
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(scan, 400);
    return () => window.clearInterval(timer);
  }, [active, scan]);

  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v != null) v.srcObject = null;
    setActive(false);
  }

  function stagePoint(e: React.MouseEvent): { x: number; y: number } {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!active) return;
    e.preventDefault();
    dragStart.current = stagePoint(e);
    setRect(null);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!active || dragStart.current == null) return;
    const p = stagePoint(e);
    const s = dragStart.current;
    setRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function onMouseUp() {
    dragStart.current = null;
  }

  return (
    <Panel head="SCREEN · 屏幕识码" brackets raised>
      {error != null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row-gap scan-screen-actions">
        {!active ? (
          <ArkButton variant="primary" icon="monitor" onClick={() => void start()}>
            启动屏幕捕获
          </ArkButton>
        ) : (
          <>
            <ArkButton onClick={() => setRect(null)}>全屏扫描 / FULL FRAME</ArkButton>
            <ArkButton onClick={stopTracks}>停止 / STOP</ArkButton>
          </>
        )}
      </div>
      <div
        ref={stageRef}
        className="scan-stage scan-stage--region"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        <video ref={videoRef} className="scan-video" muted playsInline aria-label="屏幕捕获预览" />
        {active && rect == null && <div className="scan-hint-overlay">拖拽框选区域 · DRAG TO SELECT REGION</div>}
        {rect != null && (
          <div
            className="region-rect"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            aria-hidden="true"
          />
        )}
      </div>
      <canvas ref={scratchRef} hidden />
      <p className="hint">
        每次捕获都会弹出系统选源对话框（浏览器安全规范），选择要扫描的屏幕或窗口；保持二维码完整出现在画面中。
        <span className="en-only"> / PICK A SCREEN OR WINDOW IN THE NATIVE DIALOG</span>
      </p>
    </Panel>
  );
}
