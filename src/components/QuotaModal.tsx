import { Lock, AlertTriangle, Scissors, LogIn, CheckCircle2 } from 'lucide-react';
import { QuotaSnapshot, formatResetTime } from '../utils/quota';

interface QuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: QuotaSnapshot | null;
  serviceError: boolean;
  onLogin: () => void;
}

export function QuotaModal({ isOpen, onClose, snapshot, serviceError, onLogin }: QuotaModalProps) {
  if (!isOpen) return null;

  const quota = snapshot?.quota;
  const exhausted = !!quota && quota.remaining <= 0;
  const authenticated = !!snapshot?.authenticated;

  return (
    <div
      id="quota-modal"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {serviceError ? (
          <>
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">服务暂时不可用</h3>
                <p className="text-xs text-slate-500">切割额度服务暂时无法访问</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              无法确认今日切割额度，请稍后重试。若持续出现此提示，说明服务正在维护，给您带来不便敬请谅解。
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center space-x-2.5">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  exhausted
                    ? authenticated
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-blue-50 text-blue-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {exhausted ? <Lock className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {exhausted
                    ? authenticated
                      ? '今日切割次数已用完'
                      : '今日免费次数已用完'
                    : '切割额度说明'}
                </h3>
                <p className="text-xs text-slate-500">
                  {authenticated
                    ? `登录账号：${snapshot?.user?.phone_masked || snapshot?.user?.username || '已登录'}`
                    : '当前为匿名使用（未登录）'}
                </p>
              </div>
            </div>

            {quota && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    {authenticated ? '认证用户额度' : '匿名免费额度'}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {quota.used} / {quota.limit} 次
                  </span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      exhausted ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500">
                  {exhausted
                    ? `额度将于 ${formatResetTime(quota.reset_at)}（北京时间）重置`
                    : `今日还可切割 ${quota.remaining} 次 · ${formatResetTime(quota.reset_at)} 重置`}
                </div>
              </div>
            )}

            {!authenticated && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-start space-x-2.5">
                <LogIn className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-blue-800 mb-0.5">登录解锁每日 10 次</div>
                  匿名用户每个独立 IP 每天仅可切割 1 次；使用手机号登录后，每天可切割 10 次，并可同步使用
                  SmartBid 全家桶账号。
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer actions */}
        <div className="pt-1 flex justify-end space-x-2">
          {!serviceError && !authenticated && (
            <button
              id="btn-quota-login"
              type="button"
              onClick={onLogin}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>登录 / 注册（每日 10 次）</span>
            </button>
          )}
          <button
            id="btn-quota-close"
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl font-bold text-xs shadow-sm transition ${
              !serviceError && !authenticated && exhausted
                ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {exhausted && authenticated ? '我知道了' : '关闭'}
          </button>
        </div>

        {!serviceError && !exhausted && (
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 justify-center">
            <CheckCircle2 className="w-3 h-3" />
            <span>每次点击「一键切割」消耗 1 次额度，导出与下载不限量</span>
          </div>
        )}
      </div>
    </div>
  );
}
