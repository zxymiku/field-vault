// Interop importers: Aegis plain export, 2FAS backup, Bitwarden JSON.
// Only unencrypted external formats are supported — encrypted exports must
// be decrypted by their originating app first.

import type { Algo, OtpType } from "./otp";
import { markSteamStyle, type OtpUri } from "./otpauth";

export interface ExternalImport {
  format: "aegis" | "2fas" | "bitwarden";
  entries: OtpUri[];
}

function algoOf(v: unknown): Algo {
  const u = String(v ?? "").toUpperCase().replace(/[^0-9]/g, "");
  return u === "256" ? "SHA256" : u === "512" ? "SHA512" : "SHA1";
}

function digitsOf(v: unknown): number {
  const n = Number(v) || 6;
  return n === 8 ? 8 : 6;
}

function typeOf(v: unknown): OtpType {
  return String(v ?? "").toUpperCase() === "HOTP" ? "hotp" : "totp";
}

/* ---------- Aegis: { db: { entries: [{ type, name, issuer, info: {...} }] } } */
function parseAegis(doc: Record<string, unknown>): OtpUri[] {
  const db = doc.db as { entries?: unknown[] } | undefined;
  const entries = Array.isArray(db?.entries) ? db!.entries! : [];
  const out: OtpUri[] = [];
  for (const e of entries) {
    const en = e as Record<string, unknown>;
    const info = (en.info ?? {}) as Record<string, unknown>;
    const secret = String(info.secret ?? "").replace(/\s/g, "");
    if (secret === "") continue;
    const issuer = String(en.issuer ?? "");
    const name = String(en.name ?? "");
    const type = typeOf(en.type);
    out.push({
      issuer,
      account: issuer && name.startsWith(issuer + ":") ? name.slice(issuer.length + 1) : name,
      secret: secret.toUpperCase(),
      type,
      algo: algoOf(info.algo ?? info.algorithm),
      digits: digitsOf(info.digits),
      period: Number(info.period) || 30,
      counter: type === "hotp" ? Number(info.counter) || 0 : undefined,
    });
  }
  return out;
}

/* ---------- 2FAS: { services: [{ name, otp: { tokenType, secret, ... } }] } */
function parse2Fas(doc: Record<string, unknown>): OtpUri[] {
  const services = Array.isArray(doc.services) ? (doc.services as unknown[]) : [];
  const out: OtpUri[] = [];
  for (const s of services) {
    const sv = s as Record<string, unknown>;
    const otp = (sv.otp ?? {}) as Record<string, unknown>;
    const secret = String(otp.secret ?? "").replace(/\s/g, "");
    if (secret === "") continue;
    const type = typeOf(otp.tokenType);
    const issuer = String(sv.issuer ?? otp.issuer ?? "");
    const label = String(sv.name ?? otp.label ?? "");
    out.push({
      issuer,
      account: issuer && label.startsWith(issuer + ":") ? label.slice(issuer.length + 1) : label,
      secret: secret.toUpperCase(),
      type,
      algo: algoOf(otp.algorithm),
      digits: digitsOf(otp.digits),
      period: Number(otp.period) || 30,
      counter: type === "hotp" ? Number(otp.counter) || 0 : undefined,
    });
  }
  return out;
}

/* ---------- Bitwarden: { items: [{ name, login: { totp } }] } — totp may be
   a full otpauth:// uri or a bare base32 secret. */
function parseBitwarden(doc: Record<string, unknown>): OtpUri[] {
  const items = Array.isArray(doc.items) ? (doc.items as unknown[]) : [];
  const out: OtpUri[] = [];
  for (const it of items) {
    const item = it as Record<string, unknown>;
    const login = (item.login ?? {}) as Record<string, unknown>;
    const totp = String(login.totp ?? "").trim();
    if (totp === "") continue;
    if (totp.toLowerCase().startsWith("otpauth://")) {
      try {
        const u = new URL(totp);
        const secret = (u.searchParams.get("secret") ?? "").replace(/\s/g, "");
        if (secret === "") continue;
        out.push({
          issuer: u.searchParams.get("issuer") ?? item.name?.toString() ?? "",
          account: decodeURIComponent(u.pathname.replace(/^\/+/, "")),
          secret: secret.toUpperCase(),
          type: u.host === "hotp" ? "hotp" : "totp",
          algo: algoOf(u.searchParams.get("algorithm")),
          digits: digitsOf(Number(u.searchParams.get("digits"))),
          period: Number(u.searchParams.get("period")) || 30,
        });
      } catch {
        continue;
      }
    } else {
      out.push({
        issuer: String(item.name ?? ""),
        account: "",
        secret: totp.toUpperCase(),
        type: "totp",
        algo: "SHA1",
        digits: 6,
        period: 30,
      });
    }
  }
  return out;
}

/** Detect the external format by document shape and parse it. */
export function importExternal(text: string): ExternalImport {
  const doc = JSON.parse(text) as Record<string, unknown>;
  const db = doc.db as Record<string, unknown> | undefined;
  if (db && Array.isArray(db.entries)) {
    const entries = parseAegis(doc);
    if (entries.length > 0) return { format: "aegis", entries: markSteamStyle(entries) };
  }
  if (Array.isArray(doc.services)) {
    const entries = parse2Fas(doc);
    if (entries.length > 0) return { format: "2fas", entries: markSteamStyle(entries) };
  }
  if (Array.isArray(doc.items)) {
    const entries = parseBitwarden(doc);
    if (entries.length > 0) return { format: "bitwarden", entries: markSteamStyle(entries) };
  }
  throw new Error("UNSUPPORTED_FORMAT");
}
