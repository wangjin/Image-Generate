import { useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import GeneratePage from "./pages/GeneratePage";
import EditPage from "./pages/EditPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

const NAV_ITEMS = [
  { key: "generate", label: "🎨 生成" },
  { key: "edit", label: "✏️ 编辑" },
  { key: "history", label: "🗂️ 历史" },
  { key: "settings", label: "⚙️ 设置" },
] as const;

export default function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const refreshState = useAppStore((s) => s.refreshState);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const stateData = useAppStore((s) => s.stateData);

  useEffect(() => {
    void refreshState();
    void refreshHistory();
  }, [refreshState, refreshHistory]);

  const active = stateData?.providers.find(
    (p) => p.id === stateData.activeProviderId,
  );

  return (
    <div className="flex h-full bg-slate-50 text-slate-900">
      <aside className="flex w-44 shrink-0 flex-col border-r border-slate-200 bg-white py-4">
        <div className="mb-4 px-4 text-lg font-semibold">图片生成器</div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                page === item.key
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-4 pt-3 text-xs leading-5 text-slate-400">
          当前服务商
          <div className="truncate font-medium text-slate-600">
            {active ? active.name : "未配置"}
          </div>
          {!active?.apiKey && (
            <button
              type="button"
              className="mt-1 text-red-500 underline-offset-2 hover:underline"
              onClick={() => setPage("settings")}
            >
              未填写 API Key，去设置 →
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {page === "generate" && <GeneratePage />}
        {page === "edit" && <EditPage />}
        {page === "history" && <HistoryPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
