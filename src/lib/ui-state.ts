// グループの開閉状態。グループ名は暗号化対象のデータなので、平文で永続化せず
// chrome.storage.session(ブラウザ終了で消える)にだけ置く。
const KEY = "collapsedGroups";

export async function getCollapsed(): Promise<string[]> {
  const r = await chrome.storage.session.get(KEY);
  return (r[KEY] as string[] | undefined) ?? [];
}

export async function setCollapsed(names: string[]): Promise<void> {
  await chrome.storage.session.set({ [KEY]: names });
}
