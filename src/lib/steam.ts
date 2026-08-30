// Parse local Steam authenticator data (SDA *.maFile / steamguard-cli
// steamguard.json) into bindable otpauth candidates. Only the shared_secret
// needed for code generation is imported — identity_secret (trade
// confirmations) stays out of the vault.

import { base32Encode } from "./base32";
import type { OtpUri } from "./otpauth";

function b64ToB32(b64: string): string {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return base32Encode(bytes).toUpperCase();
}

export interface SteamParsedEntry {
  accountName: string;
  uri: OtpUri;
}

/** Parse SDA maFile JSON or steamguard-cli account array. */
export function parseSteamAuthText(text: string): SteamParsedEntry[] {
  const doc = JSON.parse(text) as Record<string, unknown> | Array<Record<string, unknown>>;
  const items: Array<Record<string, unknown>> = Array.isArray(doc) ? doc : [doc];

  const out: SteamParsedEntry[] = [];
  for (const it of items) {
    if (it == null || typeof it !== "object") continue;
    if ("encryption_iv" in it) throw new Error("STEAM_ENCRYPTED");

    const shared = typeof it.shared_secret === "string" ? it.shared_secret : null;
    if (shared == null || shared === "") continue;
    const accountName = typeof it.account_name === "string" ? it.account_name : "steam";

    // some maFiles carry a ready-made otpauth uri with the base32 secret
    const uri = typeof it.uri === "string" ? it.uri : null;
    let secret = "";
    if (uri != null && uri.startsWith("otpauth://")) {
      try {
        const u = new URL(uri);
        const s = (u.searchParams.get("secret") ?? "").replace(/\s/g, "");
        if (s !== "") secret = s.toUpperCase();
      } catch {
        /* fall back to shared_secret below */
      }
    }
    if (secret === "") {
      try {
        secret = b64ToB32(shared);
      } catch {
        continue; // not valid base64 — skip this entry
      }
    }

    out.push({
      accountName,
      uri: {
        style: "steam",
        issuer: "Steam",
        account: accountName,
        secret,
        type: "totp",
        algo: "SHA1",
        digits: 5,
        period: 30,
      },
    });
  }
  if (out.length === 0) throw new Error("STEAM_NO_SECRET");
  return out;
}
