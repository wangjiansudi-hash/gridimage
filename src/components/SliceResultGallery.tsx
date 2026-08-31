import { useState } from 'react';
import { SliceItem, ExportSettings } from '../types';
import { 
  Download, 
  Archive, 
  Copy, 
  Check, 
  ExternalLink, 
  Smartphone, 
  Sparkles, 
  FileCheck, 
  Maximize2,
  X,
  Share2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { downloadSingleSlice, copySliceToClipboard, downloadSlicesZip } from '../utils/imageProcessor';
import confetti from 'canvas-confetti';

interface SliceResultGalleryProps {
  slices: SliceItem[];
  exportSettings: ExportSettings;
  onBackToEditor: () => void;
  onOpenProfilePreview: () => void;
  onOpenGuide: () => void;
}

export function SliceResultGallery({
  slices,
  exportSettings,
  onBackToEditor,
  onOpenProfilePreview,
  onOpenGuide,
}: SliceResultGalleryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [previewSlice, setPreviewSlice] = useState<SliceItem | null>(null);

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await downloadSlicesZip(slices, `${exportSettings.prefix || '视频号封面'}_全套切图.zip`, exportSettings);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopy = async (slice: SliceItem) => {
    const success = await copySliceToClipboard(slice);
    if (success) {
      setCopiedId(slice.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header of results */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              切割完成！共生成 {slices.length} 张子图
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            单张规格：{slices[0]?.width} × {slices[0]?.height} 像素 · 保持原图画质
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2">
          <button
            id="btn-view-profile-mockup"
            type="button"
            onClick={onOpenProfilePreview}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition"
          >
            <Smartphone className="w-4 h-4 text-blue-600" />
            <span>主页排版效果预览</span>
          </button>

          <button
            id="btn-download-all-zip"
            type="button"
            disabled={isZipping}
            onClick={handleDownloadZip}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            {isZipping ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>正在压缩打包...</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>批量下载全部 (ZIP)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Guide notice banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-blue-900">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {exportSettings.publishOrderMode === 'reverse_profile'
              ? '💡 已启用【主页拼图倒序模式】：请按照每张图注明的「发布顺序」从大到小发布，主页将完美拼合！'
              : '💡 已按 01、02、03 顺序编号。如需主页拼合呈现，可参考排版指南按序发布。'}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenGuide}
          className="text-blue-700 hover:text-blue-800 font-bold underline shrink-0 ml-2"
        >
          查看图解指南
        </button>
      </div>

      {/* Slices Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {slices.map((slice) => {
          const isCopied = copiedId === slice.id;
          return (
            <div
              key={slice.id}
              className="bg-slate-50 rounded-xl p-3 border border-slate-200 hover:border-blue-400 hover:bg-white transition-all flex flex-col group shadow-2xs"
            >
              {/* Thumbnail Container */}
              <div 
                className="relative aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer mb-2.5"
                onClick={() => setPreviewSlice(slice)}
              >
                <img
                  src={slice.dataUrl}
                  alt={slice.filename}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />

                {/* Top Badge: Display Order & Publish Order */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded-md border border-blue-500/30 text-blue-300 font-bold text-xs shadow">
                  <span>#{String(slice.displayOrder).padStart(2, '0')}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    (第 {slice.row + 1}行 第 {slice.col + 1}列)
                  </span>
                </div>

                {/* Publish order tag */}
                <div className="absolute bottom-2 right-2 bg-emerald-500/90 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow">
                  发布顺序: 第 {slice.publishOrder} 个
                </div>

                {/* Hover overlay for zoom */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-slate-900/90 text-white p-2 rounded-full border border-slate-700">
                    <Maximize2 className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Filename & Dimensions */}
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-slate-800 font-bold truncate" title={slice.filename}>
                  {slice.filename}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {slice.width}×{slice.height}
                </span>
              </div>

              {/* Action buttons for single slice */}
              <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => downloadSingleSlice(slice)}
                  className="flex items-center justify-center space-x-1 py-1.5 px-2.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition"
                  title="下载此单张切片"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>下载单张</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(slice)}
                  className={`flex items-center justify-center space-x-1 py-1.5 px-2.5 rounded-lg text-xs font-medium border transition ${
                    isCopied
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title="复制图片到系统剪贴板"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>复制图片</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for full resolution single preview */}
      {previewSlice && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewSlice(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-blue-600">
                  切片 #{String(previewSlice.displayOrder).padStart(2, '0')} - {previewSlice.filename}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  ({previewSlice.width} × {previewSlice.height} px)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSlice(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] flex items-center justify-center overflow-hidden bg-slate-900 rounded-xl p-2">
              <img
                src={previewSlice.dataUrl}
                alt={previewSlice.filename}
                className="max-h-[56vh] object-contain rounded"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-600">
                位置：第 {previewSlice.row + 1} 行 第 {previewSlice.col + 1} 列 · 建议发布顺序：第 {previewSlice.publishOrder}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => downloadSingleSlice(previewSlice)}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-sm flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>下载此图</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
