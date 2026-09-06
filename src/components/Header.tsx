import { useState } from 'react';
import { Scissors, HelpCircle, Sparkles, RefreshCw, Smartphone, Layers, LogIn, LogOut, UserRound, Gauge } from 'lucide-react';
import { QuotaSnapshot } from '../utils/quota';

interface HeaderProps {
  onOpenGuide: () => void;
  onReset: () => void;
  hasImage: boolean;
  activeTab: 'editor' | 'profile_preview';
  setActiveTab: (tab: 'editor' | 'profile_preview') => void;
  hasSlices: boolean;
  quota: QuotaSnapshot | null;
  onLogin: () => void;
  onLogout: () => void;
  onLogoutAll: () => void;
  onOpenQuota: () => void;
}

export function Header({
  onOpenGuide,
  onReset,
  hasImage,
  activeTab,
  setActiveTab,
  hasSlices,
  quota,
  onLogin,
  onLogout,
  onLogoutAll,
  onOpenQuota,
}: HeaderProps) {
  const [logoutMenuOpen, setLogoutMenuOpen] = useState(false);
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
          {/* Quota badge */}
          {quota && (
            <button
              id="btn-quota-status"
              type="button"
              onClick={onOpenQuota}
              title="查看今日切割额度"
              className={`hidden sm:flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                quota.quota.remaining <= 0
                  ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100/70'
                  : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Gauge className={`w-3.5 h-3.5 ${quota.quota.remaining <= 0 ? 'text-amber-500' : 'text-blue-600'}`} />
              <span className="font-mono">
                今日 {quota.quota.used}/{quota.quota.limit}
              </span>
            </button>
          )}

          {/* Auth area */}
          {quota?.authenticated && quota.user ? (
            <>
              <div
                id="auth-user-chip"
                className="hidden md:flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200"
                title={`4A 账号 ID：${quota.user.id}`}
              >
                <UserRound className="w-3.5 h-3.5 text-blue-600" />
                <span>{quota.user.phone_masked || quota.user.username}</span>
              </div>
              <div className="relative">
                <button
                  id="btn-logout"
                  type="button"
                  onClick={() => setLogoutMenuOpen((v) => !v)}
                  title="退出登录"
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition border border-slate-200"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                {logoutMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLogoutMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden">
                      <button
                        id="btn-logout-app"
                        type="button"
                        onClick={() => {
                          setLogoutMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <span className="font-semibold">退出登录</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">仅本站，本机其他设备不受影响</span>
                      </button>
                      <button
                        id="btn-logout-all"
                        type="button"
                        onClick={() => {
                          setLogoutMenuOpen(false);
                          onLogoutAll();
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition border-t border-slate-100"
                      >
                        <span className="font-semibold">退出所有设备</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">全家桶登出并吊销全部登录态</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <button
              id="btn-login"
              type="button"
              onClick={onLogin}
              title="登录后每日可切割 10 次"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>登录</span>
            </button>
          )}

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
