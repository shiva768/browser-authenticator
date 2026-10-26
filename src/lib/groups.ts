import type { Entry } from "./types";

// 表示順 = 保存順。entries 配列を「未分類 → グループ(初出順)」の順に並べ、
// 各セクション内ではピン留めを先頭にする。並び替え後はこの順で配列を保存し直す。
export interface Section {
  /** 空文字 = 未分類 */
  name: string;
  entries: Entry[];
}

export const groupOf = (e: Entry): string => e.group ?? "";

export function buildSections(entries: Entry[]): Section[] {
  const map = new Map<string, Entry[]>([["", []]]);
  for (const e of entries) {
    const g = groupOf(e);
    const list = map.get(g);
    if (list) list.push(e);
    else map.set(g, [e]);
  }
  return [...map].map(([name, list]) => ({
    name,
    entries: [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)],
  }));
}

const flatten = (sections: Section[]): Entry[] => sections.flatMap((s) => s.entries);

export function groupNames(entries: Entry[]): string[] {
  return buildSections(entries)
    .map((s) => s.name)
    .filter((n) => n !== "");
}

/**
 * エントリを移動する。to.group のセクションで to.beforeId の手前に挿入し、
 * beforeId が無ければそのグループの末尾に追加する。グループが変われば所属も変わる。
 */
export function moveEntry(
  entries: Entry[],
  id: string,
  to: { group: string; beforeId?: string }
): Entry[] {
  const sections = buildSections(entries);
  let moved: Entry | undefined;
  for (const s of sections) {
    const i = s.entries.findIndex((e) => e.id === id);
    if (i >= 0) moved = s.entries.splice(i, 1)[0];
  }
  if (!moved) return entries;
  const item: Entry = { ...moved, group: to.group };
  let target = sections.find((s) => s.name === to.group);
  if (!target) {
    target = { name: to.group, entries: [] };
    sections.push(target);
  }
  const idx = to.beforeId ? target.entries.findIndex((e) => e.id === to.beforeId) : -1;
  if (idx >= 0) target.entries.splice(idx, 0, item);
  else target.entries.push(item);
  return flatten(sections);
}

/** グループ全体を beforeName のグループの手前へ移動する(未分類は常に先頭で動かせない) */
export function moveGroup(entries: Entry[], name: string, beforeName: string): Entry[] {
  if (name === "" || name === beforeName) return entries;
  const sections = buildSections(entries);
  const from = sections.findIndex((s) => s.name === name);
  if (from < 0) return entries;
  const [moved] = sections.splice(from, 1);
  const to = sections.findIndex((s) => s.name === beforeName);
  sections.splice(Math.max(to, 1), 0, moved);
  return flatten(sections);
}

/** グループ名の変更。空文字にすると解散(未分類に戻る)。既存名と同じなら統合される */
export function renameGroup(entries: Entry[], from: string, to: string): Entry[] {
  const next = to.trim();
  if (from === "" || from === next) return entries;
  return buildSections(
    entries.map((e) => (groupOf(e) === from ? { ...e, group: next } : e))
  ).flatMap((s) => s.entries);
}
