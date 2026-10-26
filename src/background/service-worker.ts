import contentScript from "../content/scan.ts?script";
import { AUTOLOCK_ALARM, LockedError, appendUnique, lock, open, save } from "../lib/vault";
import { parseOtpUri } from "../lib/otpauth";

type Message =
  | { action: "startScan" }
  | { action: "captureForScan" }
  | { action: "qrDecoded"; text: string };

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTOLOCK_ALARM) void lock();
});

async function startScan(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("アクティブなタブが見つかりません");
  // 注入された content script が onExecute で captureForScan を要求してくる
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [contentScript] });
}

async function addFromQr(text: string): Promise<{ ok: boolean; message: string }> {
  try {
    const parsed = parseOtpUri(text);
    const view = await open();
    if (view.entries === null) throw new LockedError();
    const { entries, count } = appendUnique(view.entries, parsed);
    await save(entries);
    return {
      ok: true,
      message: count > 0 ? `${count} 件のアカウントを追加しました` : "すでに登録済みです",
    };
  } catch (e) {
    if (e instanceof LockedError) {
      return { ok: false, message: "ロック中です。拡張機能を開いてロック解除してください" };
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (msg.action === "captureForScan") {
    // オーバーレイが写り込む前(onExecute 直後)に撮影する
    const windowId = sender.tab?.windowId;
    if (windowId === undefined) {
      sendResponse({ ok: false, message: "タブを特定できません" });
      return false;
    }
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }).then(
      (image) => sendResponse({ ok: true, image }),
      (e) => sendResponse({ ok: false, message: e instanceof Error ? e.message : String(e) })
    );
    return true;
  }
  if (msg.action === "startScan") {
    startScan().then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, message: e instanceof Error ? e.message : String(e) })
    );
    return true;
  }
  if (msg.action === "qrDecoded") {
    addFromQr(msg.text).then(sendResponse);
    return true;
  }
  return false;
});
