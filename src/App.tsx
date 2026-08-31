import { useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import GeneratePage from "./pages/GeneratePage";
import EditPage from "./pages/EditPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import UpdateReadyToast from "./components/UpdateReadyToast";
import { useAutoUpdate } from "./hooks/useAutoUpdate";

const NAV_ITEMS = [
  { key: "generate", label: "生成" },
  { key: "edit", label: "编辑" },
  { key: "history", label: "历史" },
  { key: "settings", label: "设置" },
] as const;

export default function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const refreshState = useAppStore((s) => s.refreshState);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const stateData = useAppStore((s) => s.stateData);
  const appVersion = useAppStore((s) => s.appVersion);

  useAutoUpdate();

  useEffect(() => {
    void refreshState();
    void refreshHistory();
  }, [refreshState, refreshHistory]);

  const active = stateData?.providers.find(
    (p) => p.id === stateData.activeProviderId,
  );
  const keyMissing = active !== undefined && !active.apiKey;

  return (
    <div className="flex h-full bg-paper text-ink">
      {/* 看片台侧栏 */}
      <aside className="flex w-44 shrink-0 flex-col bg-stage text-bone">
        <div className="px-5 pb-6 pt-6">
          <div className="font-display text-[21px] font-bold leading-tight tracking-widest">
            图片生成器
          </div>
          <div className="eyebrow mt-2 !text-bone-2">
            {appVersion ? `v${appVersion} · ` : ""}IMAGES API
          </div>
        </div>

        <nav className="flex flex-1 flex-col">
          {NAV_ITEMS.map((item) => {
            const on = page === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setPage(item.key)}
                className={`relative py-2.5 pr-4 pl-6 text-left text-[13px] tracking-[0.08em] transition-colors duration-150 ${
                  on ? "text-bone" : "text-bone-2 hover:text-bone"
                }`}
              >
                {on && (
                  <span className="absolute top-1/2 left-0 h-[18px] w-[3px] -translate-y-1/2 rounded-r bg-cinnabar" />
                )}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="eyebrow !text-bone-2">当前服务商</div>
          <div className="mt-1.5 truncate text-[12.5px] text-bone">
            {active ? active.name : "未配置"}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                active?.apiKey ? "bg-bone" : "bg-cinnabar"
              }`}
            />
            <span
              className={`mono text-[10.5px] tracking-wide ${
                active?.apiKey ? "!text-bone-2" : "text-cinnabar"
              }`}
            >
              {active?.apiKey ? "KEY OK" : "缺 API KEY"}
            </span>
          </div>
          {keyMissing && (
            <button
              type="button"
              onClick={() => setPage("settings")}
              className="mono mt-2.5 text-[10.5px] tracking-wide text-cinnabar underline-offset-2 hover:underline"
            >
              前往设置 →
            </button>
          )}
        </div>
      </aside>

      {/* 工作台面 */}
      <main className="flex-1 overflow-y-auto px-8 py-7">
        {page === "generate" && <GeneratePage />}
        {page === "edit" && <EditPage />}
        {page === "history" && <HistoryPage />}
        {page === "settings" && <SettingsPage />}
      </main>

      <UpdateReadyToast />
    </div>
  );
}
