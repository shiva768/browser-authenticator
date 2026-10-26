import {
  decrypt, deriveKey, encrypt, exportKey, importKey, randomSalt,
  type EncryptedBlob,
} from "./crypto";
import type { Entry, NewEntry } from "./types";

// chrome.storage.local["vault"]: 平文 or 暗号化(AES-GCM)。
// 復号鍵は chrome.storage.session(ブラウザ終了で消える)にキャッシュし、
// alarms による自動ロックでクリアする。
type StoredVault = { v: 1; entries: Entry[] } | { v: 1; enc: EncryptedBlob };

const VAULT_KEY = "vault";
const SESSION_KEY = "cachedKey";
const SETTINGS_KEY = "settings";
export const AUTOLOCK_ALARM = "autolock";

export interface Settings {
  autolockMinutes: number;
}
const DEFAULT_SETTINGS: Settings = { autolockMinutes: 30 };

export class LockedError extends Error {
  constructor() {
    super("ロックされています");
  }
}

async function readStored(): Promise<StoredVault> {
  const r = await chrome.storage.local.get(VAULT_KEY);
  return (r[VAULT_KEY] as StoredVault | undefined) ?? { v: 1, entries: [] };
}

async function cachedKey(): Promise<CryptoKey | null> {
  const r = await chrome.storage.session.get(SESSION_KEY);
  const raw = r[SESSION_KEY] as string | undefined;
  return raw ? importKey(raw) : null;
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
  if ((await cachedKey()) !== null) await armAutolock();
}

/** 操作のたびに呼び、自動ロックの期限を延長する */
export async function armAutolock(): Promise<void> {
  const { autolockMinutes } = await getSettings();
  if (autolockMinutes > 0) {
    await chrome.alarms.create(AUTOLOCK_ALARM, { delayInMinutes: autolockMinutes });
  } else {
    await chrome.alarms.clear(AUTOLOCK_ALARM);
  }
}

export async function lock(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
  await chrome.alarms.clear(AUTOLOCK_ALARM);
}

export interface VaultView {
  hasPassword: boolean;
  /** null = ロック中 */
  entries: Entry[] | null;
}

export async function open(): Promise<VaultView> {
  const stored = await readStored();
  if ("entries" in stored) return { hasPassword: false, entries: stored.entries };
  const key = await cachedKey();
  if (!key) return { hasPassword: true, entries: null };
  try {
    const entries = JSON.parse(await decrypt(key, stored.enc)) as Entry[];
    await armAutolock();
    return { hasPassword: true, entries };
  } catch {
    await lock();
    return { hasPassword: true, entries: null };
  }
}

export async function unlock(password: string): Promise<Entry[]> {
  const stored = await readStored();
  if (!("enc" in stored)) throw new Error("パスワードは設定されていません");
  const key = await deriveKey(password, stored.enc.salt, stored.enc.iterations);
  const entries = JSON.parse(await decrypt(key, stored.enc)) as Entry[];
  await chrome.storage.session.set({ [SESSION_KEY]: await exportKey(key) });
  await armAutolock();
  return entries;
}

export async function save(entries: Entry[]): Promise<void> {
  const stored = await readStored();
  if ("entries" in stored) {
    await chrome.storage.local.set({ [VAULT_KEY]: { v: 1, entries } });
    return;
  }
  const key = await cachedKey();
  if (!key) throw new LockedError();
  const enc = await encrypt(key, JSON.stringify(entries), stored.enc.salt, stored.enc.iterations);
  await chrome.storage.local.set({ [VAULT_KEY]: { v: 1, enc } });
  await armAutolock();
}

export async function setPassword(entries: Entry[], password: string): Promise<void> {
  const salt = randomSalt();
  const key = await deriveKey(password, salt);
  const enc = await encrypt(key, JSON.stringify(entries), salt);
  await chrome.storage.local.set({ [VAULT_KEY]: { v: 1, enc } });
  await chrome.storage.session.set({ [SESSION_KEY]: await exportKey(key) });
  await armAutolock();
}

export async function removePassword(entries: Entry[], password: string): Promise<void> {
  const stored = await readStored();
  if ("enc" in stored) {
    // 現在のパスワードで再確認してから平文に戻す
    const key = await deriveKey(password, stored.enc.salt, stored.enc.iterations);
    await decrypt(key, stored.enc);
  }
  await chrome.storage.local.set({ [VAULT_KEY]: { v: 1, entries } });
  await lock();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toEntry(n: NewEntry): Entry {
  return { ...n, id: newId(), pinned: false };
}

/** 同じ issuer/account/secret は重複として除外して末尾に追加する */
export function appendUnique(entries: Entry[], added: NewEntry[]): { entries: Entry[]; count: number } {
  const next = [...entries];
  let count = 0;
  for (const n of added) {
    const dup = next.some(
      (e) => e.secret === n.secret && e.issuer === n.issuer && e.account === n.account
    );
    if (!dup) {
      next.push(toEntry(n));
      count++;
    }
  }
  return { entries: next, count };
}
