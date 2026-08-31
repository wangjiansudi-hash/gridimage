import { useState, useEffect } from 'react';
import { SliceItem, GridConfig } from '../types';
import { 
  Smartphone, 
  Play, 
  Heart, 
  Eye, 
  Share2, 
  RotateCcw, 
  CheckCircle, 
  Sparkles, 
  ArrowLeft,
  Info,
  Layers,
  Flame,
  Radio
} from 'lucide-react';

interface WeChatProfileMockupProps {
  slices: SliceItem[];
  grid: GridConfig;
  onBackToEditor: () => void;
  onOpenGuide: () => void;
}

export function WeChatProfileMockup({
  slices,
  grid,
  onBackToEditor,
  onOpenGuide,
}: WeChatProfileMockupProps) {
  const [simulationStep, setSimulationStep] = useState<number>(slices.length);
  const [isPlayingSimulation, setIsPlayingSimulation] = useState(false);
  const [activeTab, setActiveTab] = useState<'works' | 'liked'>('works');

  // Animation simulator for publishing
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlayingSimulation) {
      timer = setInterval(() => {
        setSimulationStep((prev) => {
          if (prev >= slices.length) {
            setIsPlayingSimulation(false);
            return slices.length;
          }
          return prev + 1;
        });
      }, 700);
    }
    return () => clearInterval(timer);
  }, [isPlayingSimulation, slices.length]);

  const handleStartSimulation = () => {
    setSimulationStep(1);
    setIsPlayingSimulation(true);
  };

  const handleResetSimulation = () => {
    setIsPlayingSimulation(false);
    setSimulationStep(slices.length);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBackToEditor}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition"
            title="返回编辑画布"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600" />
              微信视频号 · 个人主页连贯排版实景模拟
            </h3>
            <p className="text-xs text-slate-500">
              真实呈现 3 列封面阵列拼图效果，确保视觉无缝拼接与连贯性
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleStartSimulation}
            disabled={isPlayingSimulation}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-blue-600 text-blue-600" />
            <span>模拟依次发布过程</span>
          </button>

          <button
            type="button"
            onClick={handleResetSimulation}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition"
            title="查看完整主页效果"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Mockup View */}
      <div className="flex justify-center">
        {/* Realistic iPhone / Mobile frame */}
        <div className="w-full max-w-[390px] max-h-[80vh] bg-slate-900 rounded-[44px] p-3.5 shadow-xl border-4 border-slate-300 ring-1 ring-slate-200 relative overflow-hidden flex flex-col">
          {/* Dynamic Island / Speaker notch */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 flex items-center justify-between px-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-950/60 ring-1 ring-indigo-500/30"></div>
          </div>

          {/* Phone Screen Canvas */}
          <div className="bg-[#111111] rounded-[34px] overflow-hidden text-white flex flex-col pt-7 pb-4 flex-1 min-h-0">
            {/* Status bar */}
            <div className="px-6 flex justify-between items-center text-[11px] font-medium text-slate-400 mb-2">
              <span>09:41</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-[9px]">5G</span>
                <div className="w-4 h-2 border border-slate-400 rounded-sm p-0.5">
                  <div className="w-full h-full bg-slate-200"></div>
                </div>
              </div>
            </div>

            {/* Profile Header Header */}
            <div className="px-4 py-3 border-b border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 p-0.5 shadow-md">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-blue-300 font-bold text-sm">
                      创作者
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-sm text-white">视频号超级创作者</span>
                      <span className="w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-black">
                        V
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">微信号：Creator_Video88</p>
                  </div>
                </div>

                <button className="px-3.5 py-1 rounded-full bg-[#fa5151] text-white text-xs font-semibold">
                  关注
                </button>
              </div>

              {/* Bio */}
              <p className="text-[11px] text-slate-300 leading-relaxed">
                ✨ 连贯巨幅视觉艺术 · 探索微信视频号多宫格封面创意
              </p>

              {/* Stats */}
              <div className="flex items-center space-x-5 text-xs text-slate-300 pt-1">
                <div>
                  <span className="font-bold text-white">{slices.length}</span> <span className="text-[11px] text-slate-400">作品</span>
                </div>
                <div>
                  <span className="font-bold text-white">12.8w</span> <span className="text-[11px] text-slate-400">关注者</span>
                </div>
                <div>
                  <span className="font-bold text-white">68.2w</span> <span className="text-[11px] text-slate-400">获赞</span>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-white/5 text-xs text-slate-400 font-medium">
              <button className="flex-1 py-2 text-center text-white border-b-2 border-white font-bold">
                作品 ({slices.length})
              </button>
              <button className="flex-1 py-2 text-center hover:text-slate-200">
                直播回放
              </button>
              <button className="flex-1 py-2 text-center hover:text-slate-200">
                赞过
              </button>
            </div>

            {/* 3-Column Video Cover Grid (WeChat Channels layout) */}
            <div className="p-1 flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-3 gap-[2px]">
                {slices.slice(0, simulationStep).map((slice, i) => (
                  <div
                    key={slice.id}
                    className="relative aspect-[3/4] bg-slate-900 overflow-hidden group cursor-pointer"
                  >
                    <img
                      src={slice.dataUrl}
                      alt={slice.filename}
                      className="w-full h-full object-cover"
                    />

                    {/* Bottom Play count / Heart badge */}
                    <div className="absolute bottom-1 left-1 flex items-center space-x-1 text-[10px] text-white/90 font-medium drop-shadow bg-black/30 px-1 py-0.5 rounded">
                      <Play className="w-2.5 h-2.5 fill-white" />
                      <span>{Math.round((i + 1) * 3.2)}k</span>
                    </div>

                    {/* Order badge in preview */}
                    <div className="absolute top-1 left-1 bg-black/60 text-blue-300 font-mono text-[9px] px-1 rounded">
                      #{String(slice.displayOrder).padStart(2, '0')}
                    </div>
                  </div>
                ))}
              </div>

              {simulationStep < slices.length && (
                <div className="mt-4 text-center text-xs text-blue-400 animate-pulse font-medium">
                  模拟发布中... ({simulationStep}/{slices.length})
                </div>
              )}
            </div>

            {/* Bottom App Navigation Bar */}
            <div className="pt-2 px-6 border-t border-white/5 flex justify-around text-[10px] text-slate-400">
              <div className="flex flex-col items-center text-emerald-400 font-bold">
                <span>动态</span>
              </div>
              <div className="flex flex-col items-center">
                <span>推荐</span>
              </div>
              <div className="flex flex-col items-center">
                <span>消息</span>
              </div>
              <div className="flex flex-col items-center">
                <span>我</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
