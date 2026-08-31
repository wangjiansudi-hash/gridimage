import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GridConfig, ImageMeta, SliceItem } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Move, 
  Info, 
  ShieldAlert, 
  Crosshair, 
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff
} from 'lucide-react';

interface InteractiveCanvasProps {
  imageMeta: ImageMeta;
  grid: GridConfig;
  setGrid: React.Dispatch<React.SetStateAction<GridConfig>>;
  calculatedSlices: Omit<SliceItem, 'dataUrl' | 'blob'>[];
}

export function InteractiveCanvas({
  imageMeta,
  grid,
  setGrid,
  calculatedSlices,
}: InteractiveCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Guideline dragging state
  // draggingLine: { type: 'vertical' | 'horizontal', index: number } | null
  const [draggingLine, setDraggingLine] = useState<{
    type: 'vertical' | 'horizontal';
    index: number;
  } | null>(null);

  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(true);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);

  // Auto-fit zoom on mount or image change.
  // 宽度优先策略：填满列宽，高度跟随图片宽高比（宽图矮、高图高），消除 contain 策略下
  // 宽图在固定高容器里产生的上下大片留白。容器高度由 displayHeight 反推，见舞台容器 style。
  const handleAutoFit = useCallback(() => {
    if (!containerRef.current || !imageMeta.width || !imageMeta.height) return;
    const containerW = containerRef.current.clientWidth - 48; // p-6
    if (containerW <= 0) return;
    // 宽度优先：填满列宽，高度跟随图片宽高比
    const fitScale = containerW / imageMeta.width;
    setZoom(Math.max(0.1, Math.min(3, Number(fitScale.toFixed(3)))));
    setPan({ x: 0, y: 0 });
  }, [imageMeta.width, imageMeta.height]);

  useEffect(() => {
    handleAutoFit();
  }, [handleAutoFit]);

  // Re-fit when the container's real size changes (flex layouts settle late, window resizes, etc.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => handleAutoFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [handleAutoFit]);

  // Handle zooming
  const handleZoomIn = () => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.15, Number((z - 0.15).toFixed(2))));
  const handleResetZoom100 = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Dragging split lines logic
  const handleLineMouseDown = (
    e: React.MouseEvent,
    type: 'vertical' | 'horizontal',
    index: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingLine({ type, index });
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (draggingLine && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      if (draggingLine.type === 'vertical') {
        const mouseX = e.clientX - rect.left;
        const ratio = Math.max(0.05, Math.min(0.95, mouseX / rect.width));
        
        setGrid((prev) => {
          const newV = [...prev.verticalLines];
          newV[draggingLine.index] = Number(ratio.toFixed(4));
          // Sort to keep consistent
          newV.sort((a, b) => a - b);
          return { ...prev, verticalLines: newV };
        });
      } else {
        const mouseY = e.clientY - rect.top;
        const ratio = Math.max(0.05, Math.min(0.95, mouseY / rect.height));
        
        setGrid((prev) => {
          const newH = [...prev.horizontalLines];
          newH[draggingLine.index] = Number(ratio.toFixed(4));
          newH.sort((a, b) => a - b);
          return { ...prev, horizontalLines: newH };
        });
      }
    } else if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleContainerMouseUp = () => {
    setDraggingLine(null);
    setIsPanning(false);
  };

  // Start panning
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingLine) {
      setIsPanning(true);
      setDragStart({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      });
    }
  };

  // Guideline micro nudging helper
  const nudgeLine = (type: 'vertical' | 'horizontal', index: number, deltaNormalized: number) => {
    setGrid((prev) => {
      if (type === 'vertical') {
        const newV = [...prev.verticalLines];
        newV[index] = Math.max(0.01, Math.min(0.99, Number((newV[index] + deltaNormalized).toFixed(4))));
        newV.sort((a, b) => a - b);
        return { ...prev, verticalLines: newV };
      } else {
        const newH = [...prev.horizontalLines];
        newH[index] = Math.max(0.01, Math.min(0.99, Number((newH[index] + deltaNormalized).toFixed(4))));
        newH.sort((a, b) => a - b);
        return { ...prev, horizontalLines: newH };
      }
    });
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl flex flex-col overflow-hidden shadow-sm">
      {/* Canvas Top Bar Controls */}
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 z-10">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
            <button
              id="btn-zoom-out"
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-800 px-2 min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              id="btn-zoom-in"
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            id="btn-fit-screen"
            type="button"
            onClick={handleAutoFit}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>自适应</span>
          </button>

          <button
            id="btn-zoom-100"
            type="button"
            onClick={handleResetZoom100}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-2xs transition"
          >
            100% 原始
          </button>
        </div>

        {/* Feature toggles */}
        <div className="flex items-center space-x-2">
          <button
            id="btn-toggle-safe-zone"
            type="button"
            onClick={() => setShowSafeZone((v) => !v)}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              showSafeZone
                ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title="微信视频号底部约 15% 区域会有标题文案和互动按钮遮挡，开启可辅助避坑"
          >
            {showSafeZone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>安全区提示</span>
          </button>

          <button
            id="btn-toggle-coordinates"
            type="button"
            onClick={() => setShowCoordinates((v) => !v)}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              showCoordinates
                ? 'bg-slate-200 border-slate-300 text-slate-900 font-semibold'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>标尺坐标</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Stage Container.
          高度随图片显示高度自适应（imageMeta.height * zoom + 上下 padding），消除固定高容器下
          宽图的上下留白；高图封顶 max-h 并纵向滚动。displayHeight 为 0 时首帧用 min-h 兜底。 */}
      {(() => {
        const displayHeight = imageMeta.height ? Math.round(imageMeta.height * zoom) : 0;
        return (
      <div
        ref={containerRef}
        id="interactive-canvas-container"
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseDown={handleContainerMouseDown}
        className={`relative flex-1 min-h-[360px] max-h-[70vh] bg-slate-900 overflow-y-auto overflow-x-hidden flex items-start justify-center p-6 select-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.08) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
          height: displayHeight ? `${displayHeight + 48}px` : undefined,
        }}
      >
        {/* Helper Hint */}
        <div className="absolute top-4 left-4 z-20 pointer-events-none bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-xs shadow-md flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>点击并拖拽蓝/黄色虚线分割线可精准微调切割坐标</span>
        </div>

        {/* Scalable Image & Guide Overlay */}
        <div
          className="relative transition-transform duration-75 origin-center shadow-2xl rounded-lg"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Base Image */}
          <img
            ref={imageRef}
            id="source-cover-image"
            src={imageMeta.objectUrl}
            alt="Source Cover"
            className="block max-w-none pointer-events-none rounded border border-slate-700/50 shadow-2xl"
            style={{
              width: `${imageMeta.width}px`,
              height: `${imageMeta.height}px`,
            }}
            draggable={false}
          />

          {/* Grid Overlay Slices (Boxes) */}
          {calculatedSlices.map((box) => {
            const isHovered = hoveredSlice === box.index;
            return (
              <div
                key={box.id}
                onMouseEnter={() => setHoveredSlice(box.index)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`absolute transition-colors pointer-events-auto cursor-default ${
                  isHovered
                    ? 'bg-blue-500/20 ring-2 ring-blue-400 ring-inset'
                    : 'bg-transparent hover:bg-blue-500/10'
                }`}
                style={{
                  left: `${box.x}px`,
                  top: `${box.y}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                }}
              >
                {/* Number & Sequence Badge */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md text-blue-300 px-2.5 py-1 rounded-md border border-blue-500/40 text-xs font-bold shadow-md pointer-events-none">
                  <span className="text-[10px] text-slate-400">#</span>
                  <span>{String(box.displayOrder).padStart(2, '0')}</span>
                  {showCoordinates && (
                    <span className="text-[10px] font-normal text-slate-300 font-mono pl-1 border-l border-slate-700">
                      {box.width}×{box.height}
                    </span>
                  )}
                </div>

                {/* Safe zone overlay at bottom 15% */}
                {showSafeZone && (
                  <div
                    className="absolute bottom-0 left-0 right-0 border-t border-dashed border-red-500/60 bg-red-500/10 flex items-center justify-center pointer-events-none"
                    style={{ height: `${Math.round(box.height * 0.15)}px` }}
                  >
                    <span className="text-[10px] text-red-300 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-500/30 flex items-center gap-1">
                      <ShieldAlert className="w-2.5 h-2.5" /> 视频号底部标题遮挡区 (约15%)
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Interactive Vertical Split Lines */}
          {grid.verticalLines.map((vRatio, idx) => {
            const posX = Math.round(vRatio * imageMeta.width);
            const isDraggingThis = draggingLine?.type === 'vertical' && draggingLine.index === idx;

            return (
              <div
                key={`vline-${idx}`}
                className="absolute top-0 bottom-0 z-30 group"
                style={{ left: `${posX}px` }}
              >
                {/* Visual guideline */}
                <div
                  className={`absolute top-0 bottom-0 w-[2px] -translate-x-1/2 transition-colors ${
                    isDraggingThis
                      ? 'bg-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.9)]'
                      : 'bg-blue-400/90 group-hover:bg-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                  }`}
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, #3b82f6 0, #3b82f6 8px, transparent 8px, transparent 14px)',
                  }}
                />

                {/* Hit area & Drag handle */}
                <div
                  id={`handle-vline-${idx}`}
                  onMouseDown={(e) => handleLineMouseDown(e, 'vertical', idx)}
                  className="absolute top-0 bottom-0 w-8 -translate-x-1/2 cursor-col-resize flex flex-col items-center justify-center group"
                >
                  {/* Floating drag badge at center */}
                  <div className="w-6 h-10 rounded-md bg-blue-600 text-white flex flex-col items-center justify-center shadow-lg border border-blue-400 scale-90 group-hover:scale-110 transition-transform">
                    <Move className="w-3.5 h-3.5 rotate-90" />
                  </div>

                  {/* Pixel position readout badge at top */}
                  <div className="absolute top-2 bg-slate-900/90 text-blue-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-blue-500/40 shadow">
                    X: {posX}px
                  </div>
                </div>
              </div>
            );
          })}

          {/* Interactive Horizontal Split Lines */}
          {grid.horizontalLines.map((hRatio, idx) => {
            const posY = Math.round(hRatio * imageMeta.height);
            const isDraggingThis = draggingLine?.type === 'horizontal' && draggingLine.index === idx;

            return (
              <div
                key={`hline-${idx}`}
                className="absolute left-0 right-0 z-30 group"
                style={{ top: `${posY}px` }}
              >
                {/* Visual guideline */}
                <div
                  className={`absolute left-0 right-0 h-[2px] -translate-y-1/2 transition-colors ${
                    isDraggingThis
                      ? 'bg-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.9)]'
                      : 'bg-amber-400/90 group-hover:bg-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  }`}
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to right, #f59e0b 0, #f59e0b 8px, transparent 8px, transparent 14px)',
                  }}
                />

                {/* Hit area & Drag handle */}
                <div
                  id={`handle-hline-${idx}`}
                  onMouseDown={(e) => handleLineMouseDown(e, 'horizontal', idx)}
                  className="absolute left-0 right-0 h-8 -translate-y-1/2 cursor-row-resize flex items-center justify-center group"
                >
                  <div className="h-6 w-10 rounded-md bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg border border-amber-300 scale-90 group-hover:scale-110 transition-transform">
                    <Move className="w-3.5 h-3.5" />
                  </div>

                  {/* Pixel position readout badge at left */}
                  <div className="absolute left-2 bg-slate-900/90 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 shadow">
                    Y: {posY}px
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      );
      })()}

      {/* Split Line Fine-Tuning Bar */}
      <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-slate-800">分割线微调步进:</span>
          {grid.verticalLines.map((v, i) => (
            <div key={`nudge-v-${i}`} className="flex items-center space-x-1 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-blue-600 font-bold">竖线 #{i + 1}</span>
              <button
                type="button"
                onClick={() => nudgeLine('vertical', i, -0.002)}
                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                title="向左微调 0.2%"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => nudgeLine('vertical', i, 0.002)}
                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                title="向右微调 0.2%"
              >
                ▶
              </button>
            </div>
          ))}

          {grid.horizontalLines.map((h, i) => (
            <div key={`nudge-h-${i}`} className="flex items-center space-x-1 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-amber-600 font-bold">横线 #{i + 1}</span>
              <button
                type="button"
                onClick={() => nudgeLine('horizontal', i, -0.002)}
                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                title="向上微调 0.2%"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => nudgeLine('horizontal', i, 0.002)}
                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                title="向下微调 0.2%"
              >
                ▼
              </button>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-slate-500 hidden lg:block">
          拖拽分割线或使用微调按钮精确消除拼贴缝隙
        </div>
      </div>
    </div>
  );
}
