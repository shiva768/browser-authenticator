import { base32Encode } from "./base32";
import type { Algorithm, NewEntry } from "./types";

/** エントリから otpauth:// URL を作る(QRコード出力用)。parseOtpauth で往復できる */
export function buildOtpauth(e: NewEntry): string {
  const label = e.issuer
    ? `${encodeURIComponent(e.issuer)}:${encodeURIComponent(e.account)}`
    : encodeURIComponent(e.account);
  const params = new URLSearchParams({ secret: e.secret });
  if (e.issuer) params.set("issuer", e.issuer);
  params.set("algorithm", e.algorithm);
  params.set("digits", String(e.digits));
  if (e.type === "totp") params.set("period", String(e.period));
  else params.set("counter", String(e.counter));
  return `otpauth://${e.type}/${label}?${params}`;
}

export function parseOtpauth(uri: string): NewEntry {
  const url = new URL(uri.trim());
  if (url.protocol !== "otpauth:") throw new Error("otpauth:// 形式ではありません");
  const type = url.hostname;
  if (type !== "totp" && type !== "hotp") {
    throw new Error(`未対応の種別です: ${type}`);
  }
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const sep = label.indexOf(":");
  const labelIssuer = sep >= 0 ? label.slice(0, sep) : "";
  const account = (sep >= 0 ? label.slice(sep + 1) : label).trim();
  const p = url.searchParams;
  const secret = p.get("secret");
  if (!secret) throw new Error("secret がありません");
  const algorithm = (p.get("algorithm") || "SHA1").toUpperCase();
  if (!["SHA1", "SHA256", "SHA512"].includes(algorithm)) {
    throw new Error(`未対応のアルゴリズムです: ${algorithm}`);
  }
  return {
    issuer: p.get("issuer") || labelIssuer.trim(),
    account,
    secret: secret.replace(/\s/g, "").toUpperCase(),
    type,
    counter: Number(p.get("counter")) || 0,
    period: Number(p.get("period")) || 30,
    digits: Number(p.get("digits")) || 6,
    algorithm: algorithm as Algorithm,
  };
}

// --- otpauth-migration:// (Google Authenticator エクスポート形式, protobuf) ---

class Reader {
  pos = 0;
  constructor(private buf: Uint8Array) {}
  get done() {
    return this.pos >= this.buf.length;
  }
  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++];
      if (b === undefined) throw new Error("migration データが壊れています");
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  }
  bytes(): Uint8Array {
    const len = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + len);
    if (out.length !== len) throw new Error("migration データが壊れています");
    this.pos += len;
    return out;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error("migration データが壊れています");
  }
}

const MIG_ALGO: Record<number, Algorithm> = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" };

function parseMigrationEntry(buf: Uint8Array): NewEntry {
  const r = new Reader(buf);
  const text = new TextDecoder();
  let secret: Uint8Array = new Uint8Array();
  let name = "";
  let issuer = "";
  let algo = 0;
  let digits = 0;
  let type = 2;
  let counter = 0;
  while (!r.done) {
    const tag = r.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) secret = r.bytes();
    else if (field === 2 && wire === 2) name = text.decode(r.bytes());
    else if (field === 3 && wire === 2) issuer = text.decode(r.bytes());
    else if (field === 4 && wire === 0) algo = r.varint();
    else if (field === 5 && wire === 0) digits = r.varint();
    else if (field === 6 && wire === 0) type = r.varint();
    else if (field === 7 && wire === 0) counter = r.varint();
    else r.skip(wire);
  }
  if (algo === 4) throw new Error("MD5 は未対応です");
  const sep = name.indexOf(":");
  return {
    issuer: issuer || (sep >= 0 ? name.slice(0, sep).trim() : ""),
    account: (sep >= 0 ? name.slice(sep + 1) : name).trim(),
    secret: base32Encode(secret),
    type: type === 1 ? "hotp" : "totp",
    counter,
    period: 30,
    digits: digits === 2 ? 8 : 6,
    algorithm: MIG_ALGO[algo] ?? "SHA1",
  };
}

export function parseMigration(uri: string): NewEntry[] {
  const data = new URL(uri.trim()).searchParams.get("data");
  if (!data) throw new Error("data パラメータがありません");
  const bin = atob(data.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/"));
  const r = new Reader(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  const entries: NewEntry[] = [];
  while (!r.done) {
    const tag = r.varint();
    if (tag >>> 3 === 1 && (tag & 7) === 2) entries.push(parseMigrationEntry(r.bytes()));
    else r.skip(tag & 7);
  }
  return entries;
}

/** QRコードや貼り付けテキストから、追加すべきエントリ一覧を得る */
export function parseOtpUri(uri: string): NewEntry[] {
  const text = uri.trim();
  if (text.startsWith("otpauth-migration://")) return parseMigration(text);
  return [parseOtpauth(text)];
}
