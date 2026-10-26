import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { buildSections, groupNames, moveEntry, moveGroup, renameGroup } from "../src/lib/groups";
import type { Entry } from "../src/lib/types";
import QRCode from "qrcode";
import { base32Decode, base32Encode } from "../src/lib/base32";
import { generateTotp } from "../src/lib/otp";
import { buildOtpauth, parseMigration, parseOtpauth } from "../src/lib/otpauth";
import { decrypt, deriveKey, encrypt, exportKey, importKey, randomSalt } from "../src/lib/crypto";

const ascii = (s: string) => base32Encode(new TextEncoder().encode(s));

// RFC 6238 Appendix B
describe("TOTP (RFC 6238)", () => {
  const cases: [string, "SHA1" | "SHA256" | "SHA512", string, number, string][] = [
    ["12345678901234567890", "SHA1", "", 59, "94287082"],
    ["12345678901234567890", "SHA1", "", 1111111109, "07081804"],
    ["12345678901234567890123456789012", "SHA256", "", 59, "46119246"],
    ["1234567890123456789012345678901234567890123456789012345678901234", "SHA512", "", 59, "90693936"],
  ];
  for (const [secret, algorithm, , t, expected] of cases) {
    it(`${algorithm} T=${t}`, async () => {
      expect(await generateTotp(ascii(secret), { algorithm, digits: 8, time: t * 1000 })).toBe(expected);
    });
  }
  it("6桁は下位6桁", async () => {
    expect(await generateTotp(ascii("12345678901234567890"), { time: 59_000 })).toBe("287082");
  });
});

describe("base32", () => {
  it("往復できる", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 7, 9]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });
  it("不正文字はエラー", () => {
    expect(() => base32Decode("AB!C")).toThrow();
  });
});

describe("otpauth", () => {
  it("totp をパースする", () => {
    const e = parseOtpauth(
      "otpauth://totp/GitHub:alice%40example.com?secret=jbsw y3dp&issuer=GitHub&digits=8&algorithm=sha256"
    );
    expect(e).toMatchObject({
      issuer: "GitHub", account: "alice@example.com", secret: "JBSWY3DP",
      type: "totp", digits: 8, algorithm: "SHA256", period: 30,
    });
  });
  it("hotp の counter", () => {
    expect(parseOtpauth("otpauth://hotp/x?secret=JBSWY3DP&counter=5").counter).toBe(5);
  });
  it("buildOtpauth → parseOtpauth で往復できる(特殊文字含む)", () => {
    const totp = {
      issuer: "Ex & Co", account: "a+b@例.com", secret: "JBSWY3DPEHPK3PXP",
      type: "totp" as const, counter: 0, period: 60, digits: 8, algorithm: "SHA512" as const,
    };
    expect(parseOtpauth(buildOtpauth(totp))).toEqual(totp);
    const hotp = { ...totp, issuer: "", type: "hotp" as const, counter: 7, period: 30 };
    expect(parseOtpauth(buildOtpauth(hotp))).toEqual(hotp);
  });
  it("migration をパースする", () => {
    // OtpParameters{secret="Hello!\xDE\xAD\xBE\xEF", name="a:b", issuer="Iss", algo=SHA1, digits=6, type=TOTP}
    const secret = [72, 101, 108, 108, 111, 33, 222, 173, 190, 239];
    const params = [10, secret.length, ...secret, 18, 3, 97, 58, 98, 26, 3, 73, 115, 115, 32, 1, 40, 1, 48, 2];
    const payload = [10, params.length, ...params];
    const data = btoa(String.fromCharCode(...payload));
    const [e] = parseMigration(`otpauth-migration://offline?data=${encodeURIComponent(data)}`);
    expect(e).toMatchObject({ issuer: "Iss", account: "b", type: "totp", digits: 6, algorithm: "SHA1" });
    expect(base32Decode(e.secret)).toEqual(new Uint8Array(secret));
  });
});

describe("グループと並び替え", () => {
  const mk = (id: string, group?: string): Entry => ({
    id, issuer: id, account: "", secret: "JBSWY3DP", type: "totp", counter: 0,
    period: 30, digits: 6, algorithm: "SHA1", group,
  });
  const ids = (es: Entry[]) => es.map((e) => e.id).join(",");
  const base = [mk("a"), mk("b", "work"), mk("c", "work"), mk("d", "home"), mk("e")];

  it("未分類→グループ初出順に並び、各セクション内は配列の順", () => {
    expect(buildSections(base).map((s) => `${s.name}:${ids(s.entries)}`)).toEqual([
      ":a,e", "work:b,c", "home:d",
    ]);
  });
  it("移動した並びがそのまま保存順になる(再度 buildSections しても変わらない)", () => {
    const moved = moveEntry(base, "c", { group: "work", beforeId: "b" });
    expect(ids(buildSections(moved).flatMap((s) => s.entries))).toBe(ids(moved));
  });
  it("group 未設定の既存データは未分類になる", () => {
    expect(buildSections([mk("a")])[0].entries).toHaveLength(1);
  });
  it("同じグループ内で手前に挿入できる", () => {
    expect(ids(moveEntry(base, "c", { group: "work", beforeId: "b" }))).toBe("a,e,c,b,d");
  });
  it("別グループへ移動すると所属が変わる / 末尾追加 / 新規グループ作成", () => {
    const moved = moveEntry(base, "a", { group: "home" });
    expect(ids(moved)).toBe("e,b,c,d,a");
    expect(moved.find((e) => e.id === "a")?.group).toBe("home");
    expect(groupNames(moveEntry(base, "a", { group: "new" }))).toEqual(["work", "home", "new"]);
  });
  it("グループが空になると消える", () => {
    expect(groupNames(moveEntry(base, "d", { group: "" }))).toEqual(["work"]);
  });
  it("グループの順序を入れ替えられる(未分類は動かせない)", () => {
    expect(groupNames(moveGroup(base, "home", "work"))).toEqual(["home", "work"]);
    expect(groupNames(moveGroup(base, "home", ""))).toEqual(["home", "work"]);
    expect(moveGroup(base, "", "work")).toBe(base);
  });
  it("リネーム・統合・解散", () => {
    expect(groupNames(renameGroup(base, "work", "job"))).toEqual(["job", "home"]);
    expect(groupNames(renameGroup(base, "work", "home"))).toEqual(["home"]);
    expect(groupNames(renameGroup(base, "work", " "))).toEqual(["home"]);
    expect(buildSections(renameGroup(base, "work", ""))[0].entries).toHaveLength(4);
  });
});

describe("QR出力", () => {
  it("生成したQRを jsQR で読み戻すと元の otpauth URL に一致する", () => {
    const uri = buildOtpauth({
      issuer: "GitHub", account: "alice@example.com", secret: "JBSWY3DPEHPK3PXP",
      type: "totp", counter: 0, period: 30, digits: 6, algorithm: "SHA1",
    });
    const { modules } = QRCode.create(uri, { errorCorrectionLevel: "M" });
    const scale = 6;
    const margin = 4;
    const size = (modules.size + margin * 2) * scale;
    const px = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (!modules.get(y, x)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
        }
      }
    }
    expect(jsQR(px, size, size)?.data).toBe(uri);
  });
});

describe("crypto", () => {
  it("暗号化→復号、誤パスワードは失敗、鍵のexport/importができる", async () => {
    const salt = randomSalt();
    const key = await deriveKey("pw", salt, 1000);
    const blob = await encrypt(key, "secret data", salt, 1000);
    expect(await decrypt(key, blob)).toBe("secret data");
    expect(await decrypt(await importKey(await exportKey(key)), blob)).toBe("secret data");
    await expect(decrypt(await deriveKey("bad", salt, 1000), blob)).rejects.toThrow("パスワード");
  });
});
