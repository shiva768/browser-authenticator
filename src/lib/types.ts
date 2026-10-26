export type OtpType = "totp" | "hotp";
export type Algorithm = "SHA1" | "SHA256" | "SHA512";

export interface Entry {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  type: OtpType;
  counter: number;
  period: number;
  digits: number;
  algorithm: Algorithm;
  /** グループ名。未設定・空文字は「未分類」。既存データとの互換のため省略可 */
  group?: string;
}

export type NewEntry = Omit<Entry, "id">;
