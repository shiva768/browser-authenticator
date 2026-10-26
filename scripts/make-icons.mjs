// assets/icon.svg から拡張機能用の PNG アイコンを生成する。
//   node scripts/make-icons.mjs
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const SIZES = [16, 32, 48, 128];
const svg = await readFile(new URL("../assets/icon.svg", import.meta.url));
const outDir = new URL("../src/assets/icons/", import.meta.url);
await mkdir(outDir, { recursive: true });

for (const size of SIZES) {
  // 小さいサイズでも輪郭が潰れないよう、高密度でラスタライズしてから縮小する
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(new URL(`icon-${size}.png`, outDir).pathname);
  console.log(`src/assets/icons/icon-${size}.png`);
}
