import type { GenParams } from "../lib/types";
import { OUTPUT_FORMATS, RESPONSE_FORMATS, SIZE_OPTIONS } from "../lib/options";

interface Props {
  value: GenParams;
  onChange: (p: GenParams) => void;
  /** 批量运行中锁定参数 */
  disabled?: boolean;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

function Switch({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative mt-0.5 inline-flex h-[20px] w-9 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        on ? "bg-cinnabar" : "bg-line"
      }`}
    >
      <span
        className={`inline-block h-[14px] w-[14px] rounded-full bg-paper-2 shadow-sm transition-transform duration-150 ${
          on ? "translate-x-[21px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/** 参数仪表面板：size/format/response 为 select，水印与润色为开关 */
export default function GenParamsForm({ value, onChange, disabled = false }: Props) {
  const set = <K extends keyof GenParams>(k: K, v: GenParams[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div>
      <div className="rule-row">
        <span className="eyebrow">参数 PARAMETERS</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-3">
        <Field label="分辨率 SIZE">
          <select
            className="field select disabled:cursor-not-allowed disabled:opacity-50"
            value={value.size}
            disabled={disabled}
            onChange={(e) => set("size", e.target.value)}
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="文件格式 FORMAT">
          <select
            className="field select disabled:cursor-not-allowed disabled:opacity-50"
            value={value.outputFormat}
            disabled={disabled}
            onChange={(e) =>
              set("outputFormat", e.target.value as GenParams["outputFormat"])
            }
          >
            {OUTPUT_FORMATS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="返回方式 RETURN">
          <select
            className="field select disabled:cursor-not-allowed disabled:opacity-50"
            value={value.responseFormat}
            disabled={disabled}
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

        <Field label="水印 WATERMARK">
          <Switch
            on={value.watermark}
            onToggle={() => set("watermark", !value.watermark)}
            disabled={disabled}
          />
        </Field>

        <Field label="提示词润色 EXTEND">
          <Switch
            on={value.promptExtend}
            onToggle={() => set("promptExtend", !value.promptExtend)}
            disabled={disabled}
          />
        </Field>
      </div>
    </div>
  );
}
