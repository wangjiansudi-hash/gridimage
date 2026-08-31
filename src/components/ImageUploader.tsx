import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, FileImage, ShieldCheck, Zap } from 'lucide-react';
import { createDemoPoster } from '../utils/imageProcessor';

interface ImageUploaderProps {
  onImageSelected: (file: File) => void;
}

export function ImageUploader({ onImageSelected }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global paste support (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            onImageSelected(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onImageSelected]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      onImageSelected(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onImageSelected(files[0]);
    }
  };

  const handleLoadDemo = async (preset: '1x3' | '2x3' | '3x3') => {
    setIsGeneratingDemo(true);
    try {
      const demoFile = await createDemoPoster(preset);
      onImageSelected(demoFile);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Introduction text */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-3.5">
          <Zap className="w-3.5 h-3.5" /> 纯前端高精算法 · 零压缩零画质损耗 · 纯本地隐私安全
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          微信视频号 · 多宫格连贯封面智能切割
        </h2>
        <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
          专为视频号 1×3 三联横幅、2×3 六宫格、3×3 九宫格及长图海报打造。
          自动均分对齐，支持分割线实时拖拽微调，一键打包下载高清切图。
        </p>
      </div>

      {/* Main Dropzone */}
      <div
        id="image-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 group ${
          isDragging
            ? 'border-blue-500 bg-blue-50/60 ring-4 ring-blue-500/10 scale-[1.01]'
            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50/80 shadow-sm'
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-upload-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform mb-4 shadow-sm">
            <Upload className="w-8 h-8 stroke-[2]" />
          </div>

          <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            点击选择 或 拖拽大图到此处
          </h3>
          <p className="mt-1.5 text-sm text-slate-500">
            支持 JPG / PNG / WEBP 格式，也可直接在网页按 <kbd className="px-2 py-0.5 text-xs bg-slate-100 rounded-md border border-slate-300 font-mono text-slate-700 font-medium">Ctrl+V</kbd> 粘贴剪贴板截图
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <FileImage className="w-3.5 h-3.5 text-slate-500" /> 支持任意超大高分辨率长图
            </span>
            <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> 本地 Canvas 离线处理，绝不上云
            </span>
          </div>
        </div>
      </div>

      {/* Instant Demo Template Presets */}
      <div className="mt-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              没有素材？一键载入视频号标准示例海报体验：
            </span>
          </div>
          {isGeneratingDemo && (
            <span className="text-xs text-blue-600 font-medium animate-pulse">正在生成全尺寸示例海报...</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            id="btn-demo-1x3"
            type="button"
            disabled={isGeneratingDemo}
            onClick={(e) => {
              e.stopPropagation();
              handleLoadDemo('1x3');
            }}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-left transition group disabled:opacity-50"
          >
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                1行3列 三联横幅
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">3240 × 1440 像素 (3:4 单图)</div>
            </div>
            <span className="text-xs text-blue-600 group-hover:text-blue-700 font-bold">试用 &rarr;</span>
          </button>

          <button
            id="btn-demo-2x3"
            type="button"
            disabled={isGeneratingDemo}
            onClick={(e) => {
              e.stopPropagation();
              handleLoadDemo('2x3');
            }}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-left transition group disabled:opacity-50"
          >
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                2行3列 六宫格拼图
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">3240 × 2880 像素 (双排封面)</div>
            </div>
            <span className="text-xs text-blue-600 group-hover:text-blue-700 font-bold">试用 &rarr;</span>
          </button>

          <button
            id="btn-demo-3x3"
            type="button"
            disabled={isGeneratingDemo}
            onClick={(e) => {
              e.stopPropagation();
              handleLoadDemo('3x3');
            }}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 text-left transition group disabled:opacity-50"
          >
            <div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                3行3列 九宫格巨幕
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">3240 × 4320 像素 (九联矩阵)</div>
            </div>
            <span className="text-xs text-blue-600 group-hover:text-blue-700 font-bold">试用 &rarr;</span>
          </button>
        </div>
      </div>

      {/* Feature highlight badges */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            视频号 3 列标准适配
          </div>
          固定适配微信主页 3 列流，支持 1~10 行自定义灵活扩展。
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            分割线自由微调
          </div>
          支持像素级拖拽切割线，完美解决画幅白边或微小拼图缝隙。
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            一键打包 01~0N
          </div>
          自动按照发布顺序编号导出 ZIP，附带微信视频号排版发布秘籍。
        </div>
      </div>
    </div>
  );
}
