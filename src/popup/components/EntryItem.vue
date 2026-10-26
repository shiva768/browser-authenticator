<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { generateHotp, generateTotp, remainingSeconds } from "../../lib/otp";
import type { Entry } from "../../lib/types";

const props = defineProps<{ entry: Entry; now: number; editing: boolean }>();
const emit = defineEmits<{
  remove: [];
  pin: [];
  qr: [];
  group: [name: string];
  counter: [];
}>();

// このコンポーネントはカウントダウンで毎秒再描画される。:value で束縛すると
// 入力中の文字が書き戻されて消えるので、入力中の値は draft として自前で持つ。
const groupDraft = ref(props.entry.group ?? "");
watch(
  () => props.entry.group,
  (g) => (groupDraft.value = g ?? "")
);

const code = ref("------");
const copied = ref(false);
const failed = ref(false);

const step = computed(() => Math.floor(props.now / 1000 / props.entry.period));
const remain = computed(() => remainingSeconds(props.entry.period, props.now));
const ratio = computed(() => remain.value / props.entry.period);
// hotp はボタンで明示的に生成するまでマスク表示
const hotpShown = ref(false);

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

const shown = computed(() => {
  if (failed.value) return code.value;
  if (props.entry.type === "hotp" && !hotpShown.value) return "•".repeat(props.entry.digits);
  const h = Math.ceil(code.value.length / 2);
  return `${code.value.slice(0, h)} ${code.value.slice(h)}`;
});

async function copy() {
  if (failed.value) return;
  if (props.entry.type === "hotp" && !hotpShown.value) return nextHotp();
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
</script>

<template>
  <li class="entry" :class="{ pinned: entry.pinned }">
    <span v-if="editing" class="handle" title="ドラッグで並び替え">⋮⋮</span>
    <div class="body" tabindex="0" role="button" @click="copy" @keydown.enter="copy">
      <div class="title">{{ entry.issuer || entry.account }}</div>
      <div v-if="entry.issuer" class="sub">{{ entry.account }}</div>
      <div class="code" :class="{ warn: entry.type === 'totp' && remain <= 5, bad: failed }">
        {{ copied ? "コピーしました" : shown }}
      </div>
      <input
        v-if="editing"
        class="group-input"
        list="group-list"
        v-model="groupDraft"
        placeholder="グループ (未分類)"
        @click.stop
        @keydown.enter.stop
        @change="emit('group', groupDraft.trim())"
      />
    </div>
    <svg v-if="entry.type === 'totp'" class="ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8" class="track" />
      <circle cx="10" cy="10" r="8" class="bar" :style="{ strokeDashoffset: 50.27 * (1 - ratio) }" />
    </svg>
    <button v-else class="icon" title="次のコードを生成" @click="nextHotp">↻</button>
    <template v-if="editing">
      <button class="icon" :title="entry.pinned ? 'ピン解除' : 'ピン留め'" @click="emit('pin')">
        {{ entry.pinned ? "★" : "☆" }}
      </button>
      <button class="icon" title="QRコードを表示" @click="emit('qr')">▦</button>
      <button class="icon danger" title="削除" @click="emit('remove')">🗑</button>
    </template>
  </li>
</template>

<style scoped>
.entry { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.entry:hover { background: var(--hover); }
.body { flex: 1; min-width: 0; cursor: pointer; outline-offset: 2px; }
.title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code { font: 600 22px ui-monospace, Menlo, monospace; letter-spacing: 1px; color: var(--accent); }
.code.warn { color: var(--danger); }
.code.bad { font-size: 14px; color: var(--danger); }
.group-input { margin-top: 4px; padding: 3px 6px; font-size: 12px; }
.handle { cursor: grab; color: var(--muted); user-select: none; }
.ring { width: 22px; height: 22px; transform: rotate(-90deg); flex: none; }
.ring circle { fill: none; stroke-width: 3; }
.ring .track { stroke: var(--line); }
.ring .bar { stroke: var(--accent); stroke-dasharray: 50.27; transition: stroke-dashoffset 1s linear; }
</style>
