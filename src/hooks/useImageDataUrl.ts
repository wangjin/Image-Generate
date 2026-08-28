import { useEffect, useState } from "react";
import { readImageDataUrl, toErrorMessage } from "../lib/commands";

/** Data-URL 缓存按相对路径全局共享，生成页/编辑页不重复读取同一文件 */
const srcCache = new Map<string, string>();

/** 读取输出目录内图片为 <img src> 可用的 Data-URL；relPath 为空时不加载 */
export function useImageDataUrl(relPath: string | null): { src: string; err: string } {
  const [src, setSrc] = useState(() => (relPath ? (srcCache.get(relPath) ?? "") : ""));
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!relPath) {
      setSrc("");
      return;
    }
    const cached = srcCache.get(relPath);
    if (cached) {
      setSrc(cached);
      setErr("");
      return;
    }
    let cancelled = false;
    readImageDataUrl(relPath)
      .then((dataUrl) => {
        srcCache.set(relPath, dataUrl);
        if (!cancelled) {
          setSrc(dataUrl);
          setErr("");
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(toErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [relPath]);

  return { src, err };
}
