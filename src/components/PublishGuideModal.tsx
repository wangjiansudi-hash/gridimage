import React from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, ArrowRight, Grid3X3, Smartphone, Info } from 'lucide-react';

interface PublishGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PublishGuideModal({ isOpen, onClose }: PublishGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-xl relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">微信视频号多宫格封面 · 排版与发布指南</h3>
              <p className="text-xs text-slate-500">掌握视频号主页拼图的核心顺序与避坑技巧</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Publishing order diagram */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-extrabold">
              1
            </span>
            <span>为什么需要特别注意「发布顺序」？</span>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
            微信视频号主页的作品列表是 <strong className="text-slate-900">从左到右、从上到下</strong> 排列，且 <strong className="text-blue-600">最新发布的视频永远位于左上角第 1 格</strong>。
            若想在个人主页呈现一张完整的 9 宫格连贯大图海报，必须采用 <strong className="text-emerald-600">倒序发布（从底向顶）</strong>！
          </p>

          {/* Diagram box */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-blue-600 text-[11px] flex items-center gap-1">
                <Grid3X3 className="w-3.5 h-3.5" /> 目标：主页最终呈现效果
              </div>
              <div className="grid grid-cols-3 gap-1 bg-white p-2 rounded-lg text-center font-mono text-[11px] font-bold border border-slate-200">
                <div className="bg-blue-50 p-1.5 rounded text-blue-700 border border-blue-200">01</div>
                <div className="bg-blue-50 p-1.5 rounded text-blue-700 border border-blue-200">02</div>
                <div className="bg-blue-50 p-1.5 rounded text-blue-700 border border-blue-200">03</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-700">04</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-700">05</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-700">06</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-500">07</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-500">08</div>
                <div className="bg-slate-100 p-1.5 rounded text-slate-500">09</div>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-emerald-600 text-[11px] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 推荐实际发布执行顺序
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-700 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">第 1 批 (先发):</span>
                  <span>09 → 08 → 07 (底行，行内倒序)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">第 2 批 (次发):</span>
                  <span>06 → 05 → 04 (中行，行内倒序)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">第 3 批 (最后发):</span>
                  <span>03 → 02 → 01 (顶行，行内倒序)</span>
                </div>
                <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                  原理：主页每行从左到右是「新→旧」，所以行内必须倒序发，才能拼出 01→02→03 的正确顺序。整体即从 09 连续发到 01。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Safe zone & aspect ratio */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex items-center space-x-2 text-sm font-bold text-slate-900">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-extrabold">
              2
            </span>
            <span>尺寸规范与底部安全区说明</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <div className="font-bold text-slate-800">最佳推荐比例</div>
              <p className="text-slate-600 text-[11px]">
                单张封面推荐 <strong className="text-blue-600">3:4</strong>（如 1080×1440 px）。大图设计时，1×3推荐 3240×1440，3×3推荐 3240×4320。
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <div className="font-bold text-slate-800">底部 15% 标题安全区</div>
              <p className="text-slate-600 text-[11px]">
                在视频号播放流中，底部会有视频标题、作者头像及点赞浮层。设计时应避免在底部边缘排布主要文字或人脸。
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Publishing frequency warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-800 mb-0.5">防频繁限制小贴士</div>
            连续发布多条视频时，建议每条间隔 1 ~ 2 分钟，避免触发平台系统短时高频发布审核。
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition"
          >
            我知道了，开始创作
          </button>
        </div>
      </div>
    </div>
  );
}
