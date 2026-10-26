<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { generateHotp, generateTotp, remainingSeconds } from "../../lib/otp";
import type { Entry } from "../../lib/types";

const props = defineProps<{
  entry: Entry;
  now: number;
  /** 並び替え可能(ドラッグハンドルを表示) */
  sortable: boolean;
  /** キーボード選択中(検索欄からの Enter でコピーされる行) */
  active: boolean;
}>();
const emit = defineEmits<{
  remove: [];
  qr: [];
  group: [name: string];
  counter: [];
}>();

const code = ref("------");
const copied = ref(false);
const failed = ref(false);

const step = computed(() => Math.floor(props.now / 1000 / props.entry.period));
const remain = computed(() => remainingSeconds(props.entry.period, props.now));
const ratio = computed(() => remain.value / props.entry.period);
// hotp はボタンで明示的に生成するまでマスク表示
const hotpShown = ref(false);

const fmt = (c: string) => {
  const h = Math.ceil(c.length / 2);
  return `${c.slice(0, h)} ${c.slice(h)}`;
};

async function refresh() {
  const e = props.entry;
  if (e.type !== "totp") return;
  try {
    failed.value = false;
    code.value = await generateTotp(e.secret, {
      period: e.period, digits: e.digits, algorithm: e.algorithm, time: props.now,
    });
  } catch {
    failed.value = true;
    code.value = "Invalid";
  }
}
// TOTP はステップが変わるたびに再計算。HOTP は nextHotp で明示的に生成する
watch(() => [step.value, props.entry.secret], refresh, { immediate: true });

// 切り替わり間際(残り5秒以内)は次のコードも並べて表示する
const warn = computed(() => props.entry.type === "totp" && remain.value <= 5);
const nextCode = ref("");
watch(
  () => [warn.value && !failed.value, step.value, props.entry.secret] as const,
  async ([show]) => {
    if (!show) {
      nextCode.value = "";
      return;
    }
    const e = props.entry;
    try {
      nextCode.value = fmt(
        await generateTotp(e.secret, {
          period: e.period, digits: e.digits, algorithm: e.algorithm,
          time: (step.value + 1) * e.period * 1000,
        })
      );
    } catch {
      nextCode.value = "";
    }
  },
  { immediate: true }
);

const shown = computed(() => {
  if (failed.value) return code.value;
  if (props.entry.type === "hotp" && !hotpShown.value) return "•".repeat(props.entry.digits);
  return fmt(code.value);
});

async function copy() {
  if (failed.value) return;
  if (props.entry.type === "hotp" && !hotpShown.value) {
    await nextHotp();
    if (failed.value) return;
  }
  await navigator.clipboard.writeText(code.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
// counter は「次に使うカウンタ値」(otpauth 仕様)。今の値でコードを作ってから進める
async function nextHotp() {
  const e = props.entry;
  try {
    failed.value = false;
    code.value = await generateHotp(e.secret, e.counter, { digits: e.digits, algorithm: e.algorithm });
    hotpShown.value = true;
    emit("counter");
  } catch {
    failed.value = true;
    code.value = "Invalid";
  }
}
defineExpose({ copy });

// --- 行メニュー(⋯) ---
const menuOpen = ref(false);
const menuWrap = ref<HTMLElement | null>(null);
function closeOutside(e: Event) {
  if (!menuWrap.value?.contains(e.target as Node)) menuOpen.value = false;
}
function closeOnEsc(e: KeyboardEvent) {
  if (e.key === "Escape") menuOpen.value = false;
}
watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener("click", closeOutside, true);
    document.addEventListener("keydown", closeOnEsc, true);
  } else {
    document.removeEventListener("click", closeOutside, true);
    document.removeEventListener("keydown", closeOnEsc, true);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("click", closeOutside, true);
  document.removeEventListener("keydown", closeOnEsc, true);
});

// --- グループ設定 ---
// 毎秒再描画されるので :value で束縛すると入力中の文字が書き戻されて消える。
// 入力中の値は draft として自前で持つ。
const groupEditing = ref(false);
const groupDraft = ref("");
const groupInput = ref<HTMLInputElement | null>(null);
async function startGroupEdit() {
  menuOpen.value = false;
  groupDraft.value = props.entry.group ?? "";
  groupEditing.value = true;
  await nextTick();
  groupInput.value?.focus();
}
function commitGroup() {
  if (!groupEditing.value) return;
  groupEditing.value = false;
  const name = groupDraft.value.trim();
  if (name !== (props.entry.group ?? "")) emit("group", name);
}
function cancelGroup() {
  groupEditing.value = false;
}
</script>

<template>
  <li :id="`entry-${entry.id}`" class="entry" :class="{ active }">
    <span v-if="sortable" class="handle" title="ドラッグで並び替え">⋮⋮</span>
    <div class="body" tabindex="0" role="button" @click="copy" @keydown.enter="copy">
      <div class="title">{{ entry.issuer || entry.account }}</div>
      <div v-if="entry.issuer" class="sub">{{ entry.account }}</div>
      <div class="code-row">
        <span class="code" :class="{ warn, bad: failed }">{{ copied ? "コピーしました" : shown }}</span>
        <span v-if="nextCode && !copied" class="next" title="次のコード">次 {{ nextCode }}</span>
      </div>
      <input
        v-if="groupEditing"
        ref="groupInput"
        v-model="groupDraft"
        class="group-input"
        list="group-list"
        placeholder="グループ名 (空欄で未分類)"
        @click.stop
        @keydown.enter.stop.prevent="commitGroup"
        @keydown.esc.stop="cancelGroup"
        @blur="commitGroup"
      />
    </div>
    <svg v-if="entry.type === 'totp'" class="ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" class="track" />
      <circle cx="10" cy="10" r="8" class="bar" :style="{ strokeDashoffset: 50.27 * (1 - ratio) }" />
    </svg>
    <button v-else class="icon" title="次のコードを生成" @click="nextHotp">↻</button>
    <div ref="menuWrap" class="menu-wrap">
      <button class="icon" title="メニュー" @click="menuOpen = !menuOpen">⋯</button>
      <ul v-if="menuOpen" class="menu">
        <li><button @click="startGroupEdit">グループを設定</button></li>
        <li><button @click="menuOpen = false; emit('qr')">QRコードを表示</button></li>
        <li><button class="danger" @click="menuOpen = false; emit('remove')">削除</button></li>
      </ul>
    </div>
  </li>
</template>

<style scoped>
.entry { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.entry:hover { background: var(--hover); }
.entry.active { background: var(--hover); box-shadow: inset 3px 0 0 var(--accent); }
.body { flex: 1; min-width: 0; cursor: pointer; outline-offset: 2px; }
.title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-row { display: flex; align-items: baseline; gap: 10px; }
.code { font: 600 22px ui-monospace, Menlo, monospace; letter-spacing: 1px; color: var(--accent); }
.code.warn { color: var(--danger); }
.code.bad { font-size: 14px; color: var(--danger); }
.next { font: 12px ui-monospace, Menlo, monospace; color: var(--muted); }
.group-input { margin-top: 4px; padding: 3px 6px; font-size: 12px; }
.handle { cursor: grab; color: var(--muted); user-select: none; margin-left: -6px; }
.ring { width: 22px; height: 22px; transform: rotate(-90deg); flex: none; }
.ring circle { fill: none; stroke-width: 3; }
.ring .track { stroke: var(--line); }
.ring .bar { stroke: var(--accent); stroke-dasharray: 50.27; transition: stroke-dashoffset 1s linear; }
.menu-wrap { position: relative; }
.menu { position: absolute; right: 0; top: 100%; z-index: 10; list-style: none; margin: 2px 0 0; padding: 4px;
  min-width: 150px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .25); }
.menu button { width: 100%; text-align: left; border: none; padding: 6px 8px; }
</style>
