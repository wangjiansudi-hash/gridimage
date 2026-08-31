import React from 'react';
import { GridConfig, ImageMeta, ExportSettings, SliceItem } from '../types';
import { 
  Grid3X3, 
  RotateCcw, 
  Settings2, 
  Download, 
  Layers, 
  Sliders, 
  Check, 
  Info,
  Maximize2,
  FileCheck,
  Eye
} from 'lucide-react';

interface GridControlsProps {
  imageMeta: ImageMeta;
  grid: GridConfig;
  setGrid: React.Dispatch<React.SetStateAction<GridConfig>>;
  onResetEqual: () => void;
  exportSettings: ExportSettings;
  setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
  onStartSlice: () => void;
  isProcessing: boolean;
  progress: number;
  calculatedSlices: Omit<SliceItem, 'dataUrl' | 'blob'>[];
  onOpenGuide: () => void;
}

export function GridControls({
  imageMeta,
  grid,
  setGrid,
  onResetEqual,
  exportSettings,
  setExportSettings,
  onStartSlice,
  isProcessing,
  progress,
  calculatedSlices,
  onOpenGuide,
}: GridControlsProps) {
  // Preset rows changer
  const handleSetRows = (rows: number) => {
    const horizontalLines: number[] = [];
    for (let r = 1; r < rows; r++) {
      horizontalLines.push(r / rows);
    }
    setGrid((prev) => ({
      ...prev,
      rows,
      horizontalLines,
    }));
  };

  // Preset cols changer
  const handleSetCols = (cols: number) => {
    const verticalLines: number[] = [];
    for (let c = 1; c < cols; c++) {
      verticalLines.push(c / cols);
    }
    setGrid((prev) => ({
      ...prev,
      cols,
      verticalLines,
    }));
  };

  // First slice dimensions for display
  const sampleSlice = calculatedSlices[0] || {
    width: Math.round(imageMeta.width / grid.cols),
    height: Math.round(imageMeta.height / grid.rows),
    aspectRatio: (imageMeta.width / grid.cols) / (imageMeta.height / grid.rows),
  };

  // Determine WeChat ratio friendliness
  const sliceAspect = sampleSlice.width / sampleSlice.height;
  let ratioTag = {
    label: '自定义比例',
    desc: `${sampleSlice.width} × ${sampleSlice.height}`,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };

  if (Math.abs(sliceAspect - 0.75) < 0.05) {
    ratioTag = {
      label: '3:4 视频号完美竖版标准',
      desc: '推荐！全屏沉浸感极强',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  } else if (Math.abs(sliceAspect - 0.857) < 0.05) {
    ratioTag = {
      label: '6:7 视频号卡片标准',
      desc: '适配官方卡片信息流',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  } else if (Math.abs(sliceAspect - 1.0) < 0.05) {
    ratioTag = {
      label: '1:1 正方形网格',
      desc: '经典九宫格排版',
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    };
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-6 shadow-sm">
      {/* Top Section: Image Info Summary */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800">原图信息与切片规格</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 font-medium">
            {imageMeta.name.length > 20 ? `${imageMeta.name.slice(0, 18)}...` : imageMeta.name}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-[11px]">原图分辨率</span>
            <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
              {imageMeta.width} × {imageMeta.height}
            </div>
            <span className="text-[10px] text-slate-500">{formatFileSize(imageMeta.size)}</span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-[11px]">单张切图尺寸</span>
            <div className="font-mono font-bold text-blue-600 text-sm mt-0.5">
              {sampleSlice.width} × {sampleSlice.height}
            </div>
            <span className="text-[10px] text-slate-500">
              比例 1:{((sampleSlice.height / sampleSlice.width) || 1).toFixed(2)}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-[11px]">切片总数</span>
            <div className="font-mono font-bold text-emerald-600 text-sm mt-0.5">
              {grid.rows * grid.cols} 张
            </div>
            <span className="text-[10px] text-slate-500">{grid.rows} 行 × {grid.cols} 列</span>
          </div>

          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-[11px]">视频号适配度</span>
            <div className="text-[11px] font-bold text-slate-800 truncate mt-1">
              {ratioTag.label}
            </div>
            <span className="text-[10px] text-slate-500 truncate block">{ratioTag.desc}</span>
          </div>
        </div>
      </div>

      {/* Row Count Preset & Custom Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>行数模式（纵向切割）</span>
          </label>
          <span className="text-[11px] text-slate-500">
            当前：{grid.rows} 行 × {grid.cols} 列（共 {grid.rows * grid.cols} 宫格）
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { rows: 1, label: '1 行', sub: '1×3 三联横幅' },
            { rows: 2, label: '2 行', sub: '2×3 六宫格' },
            { rows: 3, label: '3 行', sub: '3×3 九宫格' },
            { rows: 4, label: '4 行', sub: '4×3 十二格' },
          ].map((item) => {
            const isSelected = grid.rows === item.rows;
            return (
              <button
                key={item.rows}
                id={`btn-preset-row-${item.rows}`}
                type="button"
                onClick={() => handleSetRows(item.rows)}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">{item.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 scale-90">{item.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Custom Row & Column Sliders */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-600 font-medium">自定义行数:</span>
            <div className="flex items-center space-x-1.5">
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  id={`btn-row-num-${num}`}
                  type="button"
                  onClick={() => handleSetRows(num)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                    grid.rows === num
                      ? 'bg-blue-600 text-white font-extrabold shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-600 font-medium">列数 (固定3列适配视频号):</span>
            <div className="flex items-center space-x-1">
              {[2, 3, 4].map((c) => (
                <button
                  key={c}
                  id={`btn-col-num-${c}`}
                  type="button"
                  onClick={() => handleSetCols(c)}
                  className={`px-2 py-1 rounded-md text-xs font-medium ${
                    grid.cols === c
                      ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {c}列 {c === 3 && '(默认)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Guideline Tuning & Reset Control */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <div className="flex items-center space-x-2">
          <button
            id="btn-reset-equal-lines"
            type="button"
            onClick={onResetEqual}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
            <span>智能均分重置</span>
          </button>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            可直接在右侧画布中拖拽分割线微调
          </span>
        </div>

        <button
          id="btn-quick-guide-link"
          type="button"
          onClick={onOpenGuide}
          className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium"
        >
          <Info className="w-3.5 h-3.5" />
          发布顺序避坑指南
        </button>
      </div>

      {/* Export & Quality Settings */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5 text-blue-600" />
            导出格式与发布顺序设置
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Format selection */}
          <div className="space-y-1.5">
            <label className="text-slate-600 text-[11px] font-medium">图片导出格式</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { format: 'image/jpeg', label: 'JPG (无损高质)' },
                { format: 'image/png', label: 'PNG (透明/原质)' },
                { format: 'image/webp', label: 'WEBP (超高压缩)' },
              ].map((item) => (
                <button
                  key={item.format}
                  type="button"
                  onClick={() =>
                    setExportSettings((prev) => ({
                      ...prev,
                      format: item.format as any,
                    }))
                  }
                  className={`py-1.5 px-2 rounded-lg text-center font-medium transition ${
                    exportSettings.format === item.format
                      ? 'bg-blue-600 text-white font-bold shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Publishing Order Mode */}
          <div className="space-y-1.5">
            <label className="text-slate-600 text-[11px] font-medium flex items-center justify-between">
              <span>编号命名与发布模式</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setExportSettings((prev) => ({
                    ...prev,
                    publishOrderMode: 'sequential',
                  }))
                }
                title="按 01, 02, 03... 从左到右从上到下命名"
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition ${
                  exportSettings.publishOrderMode === 'sequential'
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                正序编号 (01→09)
              </button>

              <button
                type="button"
                onClick={() =>
                  setExportSettings((prev) => ({
                    ...prev,
                    publishOrderMode: 'reverse_profile',
                  }))
                }
                title="由于最新视频显示在左上角，按此顺序发布可令主页拼图完美呈现"
                className={`py-1.5 px-2 rounded-lg text-center font-medium transition ${
                  exportSettings.publishOrderMode === 'reverse_profile'
                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                主页拼图倒序模式
              </button>
            </div>
          </div>
        </div>

        {/* Filename prefix */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <div className="flex-1 flex items-center space-x-2">
            <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">文件名前缀:</span>
            <input
              id="input-filename-prefix"
              type="text"
              value={exportSettings.prefix}
              onChange={(e) =>
                setExportSettings((prev) => ({ ...prev, prefix: e.target.value }))
              }
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full"
              placeholder="视频号封面"
            />
          </div>

          <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={exportSettings.includeReadme}
              onChange={(e) =>
                setExportSettings((prev) => ({ ...prev, includeReadme: e.target.checked }))
              }
              className="rounded bg-white border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] text-slate-600">压缩包内附带《发布指南txt》</span>
          </label>
        </div>
      </div>

      {/* Primary Action Button: Start Slice */}
      <div>
        <button
          id="btn-start-slice"
          type="button"
          disabled={isProcessing}
          onClick={onStartSlice}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>正在高精度切割中 ({progress}%)...</span>
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              <span>一键切割并生成 {grid.rows * grid.cols} 张封面子图</span>
            </>
          )}
        </button>
        <p className="text-[11px] text-center text-slate-500 mt-2">
          保持 100% 原图分辨率 · 毫秒级极速渲染 · 自动排列
        </p>
      </div>
    </div>
  );
}
