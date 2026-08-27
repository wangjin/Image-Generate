interface Props {
  title: string;
  /** 标题下的等宽小注 */
  caption?: string;
  actions?: React.ReactNode;
}

/** 各页统一页头：宋体标题 + 等宽小注 + 右侧动作区 */
export default function PageHeader({ title, caption, actions }: Props) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-none tracking-wide">
          {title}
        </h1>
        {caption && <p className="eyebrow mt-2.5">{caption}</p>}
      </div>
      {actions && <div className="shrink-0 pb-0.5">{actions}</div>}
    </div>
  );
}
