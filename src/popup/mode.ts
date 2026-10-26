// 同じ画面をポップアップとフルタブの両方で使う。タブ表示は ?view=tab で判別する。
export const isTabView = new URLSearchParams(location.search).get("view") === "tab";

export async function openInTab(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/popup/index.html?view=tab") });
  window.close(); // ポップアップを閉じる
}
