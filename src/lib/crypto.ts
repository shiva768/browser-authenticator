// パスワード → PBKDF2(SHA-256) → AES-256-GCM。
// GCM の認証タグ検証失敗 = パスワード誤り、として扱う。

export const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedBlob {
  salt: string;
  iv: string;
  data: string;
  iterations: number;
}

const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomSalt(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(salt) as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return b64(await crypto.subtle.exportKey("raw", key));
}

export function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", unb64(raw) as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { salt, iv: b64(iv), data: b64(data), iterations };
}

export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(blob.iv) as BufferSource },
      key,
      unb64(blob.data) as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("パスワードが違います");
  }
}
