/** 商汤 U1.5 Lite 推荐分辨率档（含 auto），size select 选项来源 */
export interface SizeOption {
  value: string;
  label: string;
}

export const SIZE_OPTIONS: SizeOption[] = [
  { value: "auto", label: "自动（编辑模式适配主图）" },
  { value: "2048x2048", label: "2048 × 2048 ｜ 1:1 ｜ 2K" },
  { value: "2720x1536", label: "2720 × 1536 ｜ 16:9 ｜ 2K" },
  { value: "1536x2720", label: "1536 × 2720 ｜ 9:16 ｜ 2K" },
  { value: "1664x2496", label: "1664 × 2496 ｜ 2:3 ｜ 2K" },
  { value: "2496x1664", label: "2496 × 1664 ｜ 3:2 ｜ 2K" },
  { value: "4096x4096", label: "4096 × 4096 ｜ 1:1 ｜ 4K" },
];

export const OUTPUT_FORMATS: SizeOption[] = [
  { value: "png", label: "PNG（无损/透明）" },
  { value: "jpeg", label: "JPEG（体积小，无透明）" },
  { value: "webp", label: "WebP（体积小 + 透明）" },
];

export const RESPONSE_FORMATS: SizeOption[] = [
  { value: "b64_json", label: "内嵌返回（推荐）" },
  { value: "url", label: "临时链接（24h 失效，自动下载）" },
];
