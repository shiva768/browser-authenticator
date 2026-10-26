import jsQR from "jsqr";

// activeTab 権限で動的に注入される。ドラッグで範囲を選び、QRをデコードする。
const ID = "__ba_scan__";

function toast(text: string, ok: boolean) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `position:fixed;top:16px;right:16px;z-index:2147483647;padding:10px 14px;
    border-radius:6px;font:14px sans-serif;color:#fff;background:${ok ? "#2e7d32" : "#c62828"};`;
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

function decode(img: HTMLImageElement, rect: { x: number; y: number; w: number; h: number }) {
  const scale = img.naturalWidth / window.innerWidth;
  const sx = Math.round(rect.x * scale);
  const sy = Math.round(rect.y * scale);
  const sw = Math.max(1, Math.round(rect.w * scale));
  const sh = Math.max(1, Math.round(rect.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh);
  return jsQR(data.data, sw, sh, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

function startSelection(image: string) {
  document.getElementById(ID)?.remove();
  const img = new Image();
  img.src = image;

  const layer = document.createElement("div");
  layer.id = ID;
  layer.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.4);";
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;border:2px solid #fff;background:rgba(255,255,255,.15);display:none;";
  const hint = document.createElement("div");
  hint.textContent = "QRコードをドラッグで囲んでください (Esc でキャンセル)";
  hint.style.cssText =
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:6px;font:14px sans-serif;color:#fff;background:#222;";
  layer.append(box, hint);
  document.body.append(layer);

  let start: { x: number; y: number } | null = null;
  const cleanup = () => {
    layer.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };
  document.addEventListener("keydown", onKey, true);

  const rectOf = (e: MouseEvent) => ({
    x: Math.min(start!.x, e.clientX),
    y: Math.min(start!.y, e.clientY),
    w: Math.abs(e.clientX - start!.x),
    h: Math.abs(e.clientY - start!.y),
  });

  layer.addEventListener("mousedown", (e) => {
    start = { x: e.clientX, y: e.clientY };
    box.style.display = "block";
  });
  layer.addEventListener("mousemove", (e) => {
    if (!start) return;
    const r = rectOf(e);
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  });
  layer.addEventListener("mouseup", async (e) => {
    if (!start) return;
    const r = rectOf(e);
    cleanup();
    if (r.w < 10 || r.h < 10) return toast("範囲が小さすぎます", false);
    await img.decode();
    const text = decode(img, r);
    if (!text) return toast("QRコードを読み取れませんでした", false);
    const res = await chrome.runtime.sendMessage({ action: "qrDecoded", text });
    toast(res.message, res.ok);
  });
}

// 注入のたびに crxjs のローダーが呼ぶ。動的 import 完了後に呼ばれるので、
// リスナー登録待ちの競合を避けるため background から画面を取得(pull)する。
export async function onExecute() {
  const res = await chrome.runtime.sendMessage({ action: "captureForScan" });
  if (!res?.ok) return toast(res?.message ?? "画面を取得できませんでした", false);
  startSelection(res.image);
}
