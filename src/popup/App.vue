<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AddEntry from "./components/AddEntry.vue";
import EntryItem from "./components/EntryItem.vue";
import GroupNameInput from "./components/GroupNameInput.vue";
import LockScreen from "./components/LockScreen.vue";
import QrView from "./components/QrView.vue";
import Settings from "./components/Settings.vue";
import { useNow } from "./useNow";
import { isTabView, openInTab } from "./mode";
import {
  LockedError, appendUnique, armAutolock, lock, open, removePassword, save, setPassword,
} from "../lib/vault";
import {
  buildSections, groupNames, groupOf, moveEntry, moveGroup, renameGroup,
} from "../lib/groups";
import { getCollapsed, setCollapsed } from "../lib/ui-state";
import type { Entry, NewEntry } from "../lib/types";

type View = "loading" | "locked" | "list" | "add" | "settings" | "qr";

const view = ref<View>("loading");
const entries = ref<Entry[]>([]);
const hasPassword = ref(false);
const search = ref("");
const editing = ref(false);
const notice = ref("");
const now = useNow();

onMounted(async () => {
  collapsed.value = new Set(await getCollapsed());
  const v = await open();
  hasPassword.value = v.hasPassword;
  if (v.entries === null) {
    view.value = "locked";
  } else {
    entries.value = v.entries;
    view.value = "list";
  }
});

function flash(msg: string) {
  notice.value = msg;
  setTimeout(() => (notice.value = ""), 3000);
}

function handleError(e: unknown) {
  if (e instanceof LockedError) {
    view.value = "locked";
  } else {
    flash(e instanceof Error ? e.message : String(e));
  }
}

async function commit(next: Entry[]) {
  const prev = entries.value;
  entries.value = next;
  try {
    await save(next);
  } catch (e) {
    entries.value = prev;
    handleError(e);
  }
}

const searching = computed(() => search.value.trim() !== "");

// 検索で絞り込み → グループごとのセクションに分割(順序は groups.ts を参照)
const sections = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = entries.value.filter(
    (e) => !q || e.issuer.toLowerCase().includes(q) || e.account.toLowerCase().includes(q)
  );
  // 未分類が空のときは出さない。検索中は一致があるセクションだけ
  return buildSections(list).filter((s) => s.entries.length > 0);
});
const hasGroups = computed(() => groupNames(entries.value).length > 0);
const names = computed(() => groupNames(entries.value));

// グループの開閉(検索中は全て開く)
const collapsed = ref<Set<string>>(new Set());
const isCollapsed = (name: string) => !searching.value && collapsed.value.has(name);
async function toggleGroup(name: string) {
  const next = new Set(collapsed.value);
  if (!next.delete(name)) next.add(name);
  collapsed.value = next;
  await setCollapsed([...next]);
}

function onUnlocked(es: Entry[]) {
  entries.value = es;
  view.value = "list";
}

async function onAdd(added: NewEntry[]) {
  const { entries: next, count } = appendUnique(entries.value, added);
  await commit(next);
  flash(count > 0 ? `${count} 件のアカウントを追加しました` : "すでに登録済みです");
  view.value = "list";
}

function remove(e: Entry) {
  if (!confirm(`「${e.issuer || e.account}」を削除しますか？\n2段階認証を解除していないと、ログインできなくなる場合があります。`)) return;
  void commit(entries.value.filter((x) => x.id !== e.id));
}

const qrEntry = ref<Entry | null>(null);
function showQr(e: Entry) {
  qrEntry.value = e;
  view.value = "qr";
}
function closeQr() {
  qrEntry.value = null; // シークレットを含むので保持しない
  view.value = "list";
}

function togglePin(e: Entry) {
  void commit(entries.value.map((x) => (x.id === e.id ? { ...x, pinned: !x.pinned } : x)));
}

function nextCounter(e: Entry) {
  void commit(entries.value.map((x) => (x.id === e.id ? { ...x, counter: x.counter + 1 } : x)));
}

// ドラッグ&ドロップ(編集モード・検索なしのときのみ)
//  - アカウントを別のアカウントへ: その手前へ挿入(グループも移る)
//  - アカウントをグループ見出しへ: そのグループの末尾へ
//  - グループ見出しを別の見出しへ: グループごとその手前へ
const dragId = ref<string | null>(null);
const dragGroup = ref<string | null>(null);
const canDrag = computed(() => editing.value && !searching.value);

function endDrag() {
  dragId.value = null;
  dragGroup.value = null;
}

function onDrop(target: Entry) {
  const id = dragId.value;
  const group = dragGroup.value;
  endDrag();
  if (id && id !== target.id) {
    void commit(moveEntry(entries.value, id, { group: groupOf(target), beforeId: target.id }));
  } else if (group !== null) {
    void commit(moveGroup(entries.value, group, groupOf(target)));
  }
}

function onDropOnGroup(name: string) {
  const id = dragId.value;
  const group = dragGroup.value;
  endDrag();
  if (id) void commit(moveEntry(entries.value, id, { group: name }));
  else if (group !== null) void commit(moveGroup(entries.value, group, name));
}

function setGroup(e: Entry, name: string) {
  void commit(moveEntry(entries.value, e.id, { group: name }));
}

function rename(from: string, to: string) {
  void commit(renameGroup(entries.value, from, to));
}

async function doLock() {
  await lock();
  entries.value = [];
  view.value = "locked";
}

async function onSetPassword(pw: string) {
  try {
    await setPassword(entries.value, pw);
    hasPassword.value = true;
    flash("パスワードを設定しました");
    view.value = "list";
  } catch (e) {
    handleError(e);
  }
}

async function onRemovePassword(pw: string) {
  try {
    await removePassword(entries.value, pw);
    hasPassword.value = false;
    flash("パスワードを解除しました");
    view.value = "list";
  } catch (e) {
    handleError(e);
  }
}

// 操作があったら自動ロックの期限を延長
let lastTouch = 0;
function touch() {
  if (!hasPassword.value || view.value === "locked" || Date.now() - lastTouch < 60_000) return;
  lastTouch = Date.now();
  void armAutolock();
}
</script>

<template>
  <div @click.capture="touch" @keydown.capture="touch">
    <header>
      <h1>Authenticator</h1>
      <template v-if="view === 'list'">
        <button class="icon" title="アカウントを追加" @click="view = 'add'">＋</button>
        <button class="icon" :class="{ active: editing }" title="編集モード" @click="editing = !editing">✎</button>
        <button class="icon" title="設定" @click="view = 'settings'">⚙</button>
        <button v-if="!isTabView" class="icon" title="画面で開く" @click="openInTab">⧉</button>
        <button v-if="hasPassword" class="icon" title="ロック" @click="doLock">🔒</button>
      </template>
    </header>

    <p v-if="notice" class="note" style="padding: 6px 12px">{{ notice }}</p>

    <LockScreen v-if="view === 'locked'" @unlocked="onUnlocked" />

    <template v-else-if="view === 'list'">
      <div v-if="entries.length === 0" class="empty">
        アカウントがありません。<br />右上の「＋」から追加してください。
      </div>
      <template v-else>
        <div style="padding: 8px 12px">
          <input v-model="search" type="search" placeholder="検索 (発行元・アカウント)" />
        </div>
        <datalist id="group-list">
          <option v-for="g in names" :key="g" :value="g" />
        </datalist>
        <ul style="list-style: none; margin: 0; padding: 0">
          <template v-for="s in sections" :key="s.name">
            <li
              v-if="hasGroups"
              class="group-header"
              :draggable="canDrag && s.name !== ''"
              @click="toggleGroup(s.name)"
              @dragstart="dragGroup = s.name"
              @dragend="endDrag"
              @dragover.prevent
              @drop.prevent="onDropOnGroup(s.name)"
            >
              <span class="chev">{{ isCollapsed(s.name) ? "▸" : "▾" }}</span>
              <GroupNameInput
                v-if="editing && s.name !== ''"
                :name="s.name"
                @rename="rename(s.name, $event)"
              />
              <span v-else class="group-title">{{ s.name || "未分類" }}</span>
              <span class="count">{{ s.entries.length }}</span>
            </li>
            <template v-if="!isCollapsed(s.name)">
              <EntryItem
                v-for="e in s.entries"
                :key="e.id"
                :entry="e"
                :now="now"
                :editing="editing"
                :draggable="canDrag"
                @dragstart="dragId = e.id"
                @dragend="endDrag"
                @dragover.prevent
                @drop.prevent="onDrop(e)"
                @remove="remove(e)"
                @pin="togglePin(e)"
                @qr="showQr(e)"
                @group="setGroup(e, $event)"
                @counter="nextCounter(e)"
              />
            </template>
          </template>
        </ul>
        <p v-if="sections.length === 0" class="empty">一致するアカウントがありません。</p>
      </template>
    </template>

    <AddEntry v-else-if="view === 'add'" @add="onAdd" @cancel="view = 'list'" />

    <QrView v-else-if="view === 'qr' && qrEntry" :entry="qrEntry" @close="closeQr" />

    <Settings
      v-else-if="view === 'settings'"
      :has-password="hasPassword"
      @back="view = 'list'"
      @set-password="onSetPassword"
      @remove-password="onRemovePassword"
      @lock="doLock"
    />
  </div>
</template>

<style scoped>
.group-header { display: flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer;
  background: var(--hover); border-bottom: 1px solid var(--line); font-size: 12px; font-weight: 600;
  color: var(--muted); user-select: none; }
.group-header .chev { width: 12px; }
.group-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { font-weight: 400; }
</style>
