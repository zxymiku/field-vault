import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* Shared ark-ui components — endfield family grammar.
   Semantic classes live in styles/*.css; keep DOM wiring stable. */

/* ---------- original line icons (1.5px stroke) ---------- */
const I = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "square" as const,
};

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    vault: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" {...I} />
        <circle cx="12" cy="12" r="4.2" {...I} />
        <path d="M12 7.8v1.4M12 14.8v1.4M7.8 12h1.4M14.8 12h1.4" {...I} />
      </>
    ),
    scan: (
      <>
        <path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16" {...I} />
        <path d="M3.5 12h17" {...I} />
      </>
    ),
    settings: (
      <>
        <path d="M4 8h10M18 8h2M4 16h4M12 16h8" {...I} />
        <circle cx="16" cy="8" r="2" {...I} />
        <circle cx="10" cy="16" r="2" {...I} />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10.5" width="14" height="9.5" {...I} />
        <path d="M8 10.5V8a4 4 0 018 0v2.5" {...I} />
        <path d="M12 14v3" {...I} />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" {...I} />,
    camera: (
      <>
        <rect x="3.5" y="7" width="17" height="12.5" {...I} />
        <path d="M8.5 7l1.5-2.5h4L15.5 7" {...I} />
        <circle cx="12" cy="13" r="3.4" {...I} />
      </>
    ),
    image: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" {...I} />
        <path d="M3.5 16l5-5 4 4 3-3 5 5" {...I} />
        <circle cx="9" cy="9" r="1.4" {...I} />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4.5" width="18" height="12" {...I} />
        <path d="M9.5 20h5M12 16.5V20" {...I} />
      </>
    ),
    copy: (
      <>
        <rect x="8.5" y="8.5" width="11" height="11" {...I} />
        <path d="M15.5 5.5H5.5v10" {...I} />
      </>
    ),
    trash: (
      <>
        <path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13" {...I} />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h16" {...I} />
        <path d="M6 16.5L16.5 6l2 2L8 18.5l-3 .8.8-2.8z" {...I} />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="12" r="3.5" {...I} />
        <path d="M11.5 12H20M17 12v3M14.5 12v2" {...I} />
      </>
    ),
    back: <path d="M14 6l-6 6 6 6" {...I} />,
    eye: (
      <>
        <path d="M3 12s3.5-5.5 9-5.5S21 12 21 12s-3.5 5.5-9 5.5S3 12 3 12z" {...I} />
        <circle cx="12" cy="12" r="2.5" {...I} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

export type IconName =
  | "vault"
  | "scan"
  | "settings"
  | "lock"
  | "plus"
  | "camera"
  | "image"
  | "monitor"
  | "copy"
  | "trash"
  | "edit"
  | "key"
  | "back"
  | "eye";

/* ---------- shell ---------- */
export interface NavItem {
  id: string;
  icon: IconName;
  label: string;
}

export function ArkShell(props: {
  title: ReactNode;
  meta?: ReactNode;
  nav: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  baseline?: ReactNode;
  dock?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ark-shell">
      <nav className="ark-rail" aria-label="主导航 / PRIMARY">
        <span className="ark-rail__glyph" aria-hidden="true">
          FV
        </span>
        {props.nav.map((n) => (
          <button
            key={n.id}
            type="button"
            className="ark-rail__item"
            aria-current={props.active === n.id ? "page" : undefined}
            aria-label={n.label}
            title={n.label}
            onClick={() => props.onNavigate(n.id)}
          >
            <Icon name={n.icon} />
          </button>
        ))}
        {props.dock != null && <div className="ark-rail__dock">{props.dock}</div>}
      </nav>

      <header className="ark-topbar">
        <span className="ark-topbar__title">{props.title}</span>
        {props.meta != null && <div className="ark-topbar__meta">{props.meta}</div>}
      </header>

      <main className="ark-stage">
        <div className="ark-stage__body">{props.children}</div>
        {props.baseline != null && <div className="ark-baseline">{props.baseline}</div>}
      </main>
    </div>
  );
}

/* ---------- section title ---------- */
export function SectionTitle(props: { index: string; cn: string; en: string }) {
  return (
    <header className="ark-section">
      <span className="ark-section__index" aria-hidden="true">
        {props.index}
        <sup>/</sup>
      </span>
      <div className="ark-section__names">
        <h1 className="ark-section__cn">{props.cn}</h1>
        <span className="ark-section__en">{props.en}</span>
      </div>
      <span className="ark-section__rule" aria-hidden="true" />
    </header>
  );
}

/* ---------- technical panel ---------- */
export function Panel(props: {
  head?: ReactNode;
  headRight?: ReactNode;
  brackets?: boolean;
  raised?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = [
    "ark-panel",
    props.brackets ? "ark-panel--brackets" : "",
    props.raised ? "ark-panel--raised" : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls}>
      {props.head != null && (
        <div className="ark-panel__head">
          <span>{props.head}</span>
          {props.headRight}
        </div>
      )}
      {props.children}
    </section>
  );
}

/* ---------- buttons ---------- */
export function ArkButton(props: {
  variant?: "primary" | "default" | "danger";
  icon?: IconName;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { variant, icon, children, className, ...rest } = props;
  const cls = [
    "ark-btn",
    variant === "primary" ? "ark-btn--primary" : "",
    variant === "danger" ? "ark-btn--danger" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      <span className="ark-btn__wedge" aria-hidden="true" />
      {icon != null && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

/* ---------- field ---------- */
export function Field(props: { label: string; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const { label, mono, className, ...rest } = props;
  return (
    <label className="ark-field">
      <span className="ark-field__label">{label}</span>
      <input className={`ark-field__input${mono ? " ark-field__input--mono" : ""} ${className ?? ""}`} {...rest} />
    </label>
  );
}

/* ---------- countdown wedge + code readout ---------- */
export function Wedge(props: { progress: number; critical?: boolean }) {
  const p = Math.max(0, Math.min(1, props.progress));
  return (
    <span
      className="ark-wedge"
      data-critical={props.critical ? "true" : undefined}
      style={{ ["--p" as string]: p.toFixed(3) }}
      role="img"
      aria-label={`剩余 ${Math.round(p * 100)}%`}
    />
  );
}

export function CodeReadout(props: { code: string; progress: number; critical?: boolean }) {
  const half = props.code.length >= 6 ? Math.ceil(props.code.length / 2) : props.code.length;
  return (
    <span className="ark-readout">
      <span className="ark-readout__code" data-critical={props.critical ? "true" : undefined}>
        {props.code.slice(0, half)} {props.code.slice(half)}
      </span>
      <Wedge progress={props.progress} critical={props.critical} />
    </span>
  );
}
