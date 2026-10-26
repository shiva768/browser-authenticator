import { base32Decode } from "./base32";
import type { Algorithm } from "./types";

const HASHES: Record<Algorithm, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
};

export interface OtpOptions {
  digits?: number;
  algorithm?: Algorithm;
}

export async function generateHotp(
  secret: string,
  counter: number,
  { digits = 6, algorithm = "SHA1" }: OtpOptions = {}
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret) as BufferSource,
    { name: "HMAC", hash: HASHES[algorithm] },
    false,
    ["sign"]
  );
  const msg = new DataView(new ArrayBuffer(8));
  msg.setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function generateTotp(
  secret: string,
  { period = 30, time = Date.now(), ...opts }: OtpOptions & { period?: number; time?: number } = {}
): Promise<string> {
  return generateHotp(secret, Math.floor(time / 1000 / period), opts);
}

/** 現在のコードが切り替わるまでの残り秒数 */
export function remainingSeconds(period: number, time = Date.now()): number {
  return period - (Math.floor(time / 1000) % period);
}
