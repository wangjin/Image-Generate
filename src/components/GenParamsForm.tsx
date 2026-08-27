import type { GenParams } from "../lib/types";
import { OUTPUT_FORMATS, RESPONSE_FORMATS, SIZE_OPTIONS } from "../lib/options";

interface Props {
  value: GenParams;
  onChange: (p: GenParams) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const selectCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

/** 生成/编辑两页共用的参数表单：size/output_format/response_format 为 select，watermark/prompt_extend 为开关 */
export default function GenParamsForm({ value, onChange }: Props) {
  const set = <K extends keyof GenParams>(k: K, v: GenParams[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
      <Field label="分辨率 size">
        <select
          className={selectCls}
          value={value.size}
          onChange={(e) => set("size", e.target.value)}
        >
          {SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="文件格式 output_format">
        <select
          className={selectCls}
          value={value.outputFormat}
          onChange={(e) => set("outputFormat", e.target.value as GenParams["outputFormat"])}
        >
          {OUTPUT_FORMATS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="返回方式 response_format">
        <select
          className={selectCls}
          value={value.responseFormat}
          onChange={(e) =>
            set("responseFormat", e.target.value as GenParams["responseFormat"])
          }
        >
          {RESPONSE_FORMATS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="水印 watermark">
        <button
          type="button"
          role="switch"
          aria-checked={value.watermark}
          onClick={() => set("watermark", !value.watermark)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            value.watermark ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value.watermark ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </Field>

      <Field label="提示词润色 prompt_extend">
        <button
          type="button"
          role="switch"
          aria-checked={value.promptExtend}
          onClick={() => set("promptExtend", !value.promptExtend)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            value.promptExtend ? "bg-indigo-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              value.promptExtend ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </Field>
    </div>
  );
}
