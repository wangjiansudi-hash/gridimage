import { Scissors, HelpCircle, Sparkles, RefreshCw, Smartphone, Layers } from 'lucide-react';

interface HeaderProps {
  onOpenGuide: () => void;
  onReset: () => void;
  hasImage: boolean;
  activeTab: 'editor' | 'profile_preview';
  setActiveTab: (tab: 'editor' | 'profile_preview') => void;
  hasSlices: boolean;
}

export function Header({
  onOpenGuide,
  onReset,
  hasImage,
  activeTab,
  setActiveTab,
  hasSlices,
}: HeaderProps) {
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm ring-1 ring-blue-500/30">
            <Scissors className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                视频号多宫格封面智能切割
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  微信生态专属
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 hidden md:block">
              长图一键等分切割 · 分割线交互微调 · 无损批量导出 ZIP
            </p>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {hasImage && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                id="tab-editor"
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'editor'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>画布切割</span>
              </button>

              <button
                id="tab-profile-preview"
                type="button"
                onClick={() => setActiveTab('profile_preview')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'profile_preview'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>视频号主页预览</span>
                {hasSlices && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            </div>
          )}

          <button
            id="btn-open-guide"
            type="button"
            onClick={onOpenGuide}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 hover:bg-blue-100/70 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">排版与发布指南</span>
            <span className="sm:hidden">指南</span>
          </button>

          {hasImage && (
            <button
              id="btn-header-reset"
              type="button"
              onClick={onReset}
              title="重新上传图片"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition border border-slate-200"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
