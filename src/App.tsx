import { useState, useCallback, useMemo, useEffect } from 'react';
import { GridConfig, ImageMeta, SliceItem, ExportSettings } from './types';
import { getEqualSplitLines, calculateSliceBoxes, executeSliceImage } from './utils/imageProcessor';
import { initSSO, requireLogin, clearToken, logoutEverywhere } from './utils/auth';
import { fetchQuotaSnapshot, consumeQuota, QuotaSnapshot } from './utils/quota';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { GridControls } from './components/GridControls';
import { InteractiveCanvas } from './components/InteractiveCanvas';
import { SliceResultGallery } from './components/SliceResultGallery';
import { WeChatProfileMockup } from './components/WeChatProfileMockup';
import { PublishGuideModal } from './components/PublishGuideModal';
import { QuotaModal } from './components/QuotaModal';
import { Sparkles, Layers, RefreshCw, Scissors } from 'lucide-react';

export default function App() {
  // Main loaded image metadata
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);

  // Grid split configuration (default cols=3, rows=1)
  const [grid, setGrid] = useState<GridConfig>(() => {
    const lines = getEqualSplitLines(1, 3);
    return {
      rows: 1,
      cols: 3,
      verticalLines: lines.verticalLines,
      horizontalLines: lines.horizontalLines,
    };
  });

  // Export settings
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'image/jpeg',
    quality: 0.95,
    prefix: '视频号封面',
    publishOrderMode: 'reverse_profile',
    outputSizeMode: 'original',
    includeReadme: true,
  });

  // Sliced result items
  const [slices, setSlices] = useState<SliceItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // Active view tab & guide modal
  const [activeTab, setActiveTab] = useState<'editor' | 'profile_preview'>('editor');
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  // 4A 认证与切割额度（匿名 1 次/天/IP，认证 10 次/天）
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaModal, setQuotaModal] = useState<{ open: boolean; serviceError: boolean }>({
    open: false,
    serviceError: false,
  });

  const refreshQuota = useCallback(async () => {
    const snapshot = await fetchQuotaSnapshot();
    setQuota(snapshot);
  }, []);

  // 页面加载：恢复 4A 登录态（URL token → localStorage → 跨子域 cookie）并拉取额度
  useEffect(() => {
    initSSO();
    refreshQuota();
  }, [refreshQuota]);

  const handleLogin = useCallback(() => {
    requireLogin();
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    refreshQuota();
  }, [refreshQuota]);

  const handleLogoutAll = useCallback(() => {
    // 全家桶登出：4A /logout 清会话 cookie 并吊销全部 token 后 302 回跳本页
    logoutEverywhere();
  }, []);

  const handleOpenQuotaModal = useCallback(() => {
    setQuotaModal({ open: true, serviceError: false });
  }, []);

  // Handle image upload
  const handleImageSelected = useCallback((file: File) => {
    // Guard: reject oversized files before decoding (prevents canvas memory exhaustion)
    const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
    const MAX_PIXELS = 100_000_000; // ~100 megapixels
    if (file.size > MAX_FILE_BYTES) {
      alert(`图片文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），超过 50 MB 上限，请压缩后重试。`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;

    img.onload = () => {
      // Guard: reject decoded images whose pixel count would blow up canvas memory
      if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
        URL.revokeObjectURL(objectUrl);
        alert(
          `图片分辨率过大（${img.naturalWidth}×${img.naturalHeight} = ${((img.naturalWidth * img.naturalHeight) / 1e6).toFixed(1)} MP），超过 100 MP 上限，请缩小后重试。`
        );
        return;
      }

      // Auto-detect optimal row preset based on image aspect ratio
      const aspect = img.naturalWidth / img.naturalHeight;
      let initialRows = 1;

      // If aspect is roughly 3:1 -> 1 row (3 columns)
      // If aspect is roughly 3:2 -> 2 rows
      // If aspect is roughly 1:1 or vertical -> 3 rows (九宫格)
      if (aspect < 0.9) {
        initialRows = 3;
      } else if (aspect < 1.6) {
        initialRows = 2;
      } else {
        initialRows = 1;
      }

      const lines = getEqualSplitLines(initialRows, 3);
      setGrid({
        rows: initialRows,
        cols: 3,
        verticalLines: lines.verticalLines,
        horizontalLines: lines.horizontalLines,
      });

      setImageMeta({
        file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        type: file.type,
        objectUrl,
        imageElement: img,
      });

      // Clear previous slice results
      setSlices([]);
      setActiveTab('editor');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert('图片加载失败，可能文件已损坏或格式不受支持。');
    };
  }, []);

  // Reset split lines to equal distribution
  const handleResetEqual = useCallback(() => {
    const lines = getEqualSplitLines(grid.rows, grid.cols);
    setGrid((prev) => ({
      ...prev,
      verticalLines: lines.verticalLines,
      horizontalLines: lines.horizontalLines,
    }));
  }, [grid.rows, grid.cols]);

  // Full reset to upload new image
  const handleResetAll = useCallback(() => {
    if (imageMeta?.objectUrl) {
      URL.revokeObjectURL(imageMeta.objectUrl);
    }
    setImageMeta(null);
    setSlices([]);
    setActiveTab('editor');
  }, [imageMeta]);

  // Real-time calculated slice boxes
  const calculatedSlices = useMemo(() => {
    if (!imageMeta) return [];
    const extension = exportSettings.format === 'image/png' ? 'png' : exportSettings.format === 'image/webp' ? 'webp' : 'jpg';
    return calculateSliceBoxes(
      imageMeta.width,
      imageMeta.height,
      grid,
      exportSettings.publishOrderMode,
      exportSettings.prefix || '视频号封面',
      extension
    );
  }, [imageMeta, grid, exportSettings.publishOrderMode, exportSettings.prefix, exportSettings.format]);

  // Trigger Slicing operation（先向服务端申请扣减 1 次额度，成功后才执行切割）
  const handleStartSlice = async () => {
    if (!imageMeta?.imageElement || isProcessing) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const gate = await consumeQuota();
      if (gate.ok) {
        setQuota(gate.snapshot);
      } else if (gate.reason === 'quota_exceeded') {
        setQuota(gate.snapshot);
        setQuotaModal({ open: true, serviceError: false });
        return;
      } else {
        // 额度服务不可达：开发环境放行，生产环境拦截（防止绕过配额）
        if (import.meta.env.DEV) {
          console.warn('[quota] 服务不可达，开发环境放行本次切割');
        } else {
          setQuotaModal({ open: true, serviceError: true });
          return;
        }
      }

      const results = await executeSliceImage(
        imageMeta.imageElement,
        grid,
        exportSettings,
        (pct) => setProgress(pct)
      );
      setSlices(results);
    } catch (err) {
      console.error('Slicing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 额度提示文案（切割按钮下方）
  const quotaHint = useMemo(() => {
    if (!quota) return null;
    if (quota.authenticated) {
      return `认证账号今日还可切割 ${quota.quota.remaining} / ${quota.quota.limit} 次`;
    }
    return `匿名用户今日还可免费切割 ${quota.quota.remaining} / ${quota.quota.limit} 次 · 登录后每日 10 次`;
  }, [quota]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Header */}
      <Header
        onOpenGuide={() => setIsGuideOpen(true)}
        onReset={handleResetAll}
        hasImage={!!imageMeta}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasSlices={slices.length > 0}
        quota={quota}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onLogoutAll={handleLogoutAll}
        onOpenQuota={handleOpenQuotaModal}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {!imageMeta ? (
          <ImageUploader onImageSelected={handleImageSelected} />
        ) : activeTab === 'profile_preview' ? (
          <WeChatProfileMockup
            slices={slices.length > 0 ? slices : (calculatedSlices as any)}
            grid={grid}
            onBackToEditor={() => setActiveTab('editor')}
            onOpenGuide={() => setIsGuideOpen(true)}
          />
        ) : (
          <div className="space-y-6">
            {/* Editor Top / Splitter Stage */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Grid Controls & Configuration */}
              <div className="lg:col-span-5 space-y-6">
                <GridControls
                  imageMeta={imageMeta}
                  grid={grid}
                  setGrid={setGrid}
                  onResetEqual={handleResetEqual}
                  exportSettings={exportSettings}
                  setExportSettings={setExportSettings}
                  onStartSlice={handleStartSlice}
                  isProcessing={isProcessing}
                  progress={progress}
                  calculatedSlices={calculatedSlices}
                  onOpenGuide={() => setIsGuideOpen(true)}
                  quotaHint={quotaHint}
                />
              </div>

              {/* Right Column: Interactive Canvas & Guide Lines */}
              <div className="lg:col-span-7">
                <InteractiveCanvas
                  imageMeta={imageMeta}
                  grid={grid}
                  setGrid={setGrid}
                  calculatedSlices={calculatedSlices}
                />
              </div>
            </div>

            {/* Sliced Gallery Section (If sliced) */}
            {slices.length > 0 && (
              <div id="sliced-results-section" className="pt-4">
                <SliceResultGallery
                  slices={slices}
                  exportSettings={exportSettings}
                  onBackToEditor={() => {
                    const el = document.getElementById('interactive-canvas-container');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  onOpenProfilePreview={() => setActiveTab('profile_preview')}
                  onOpenGuide={() => setIsGuideOpen(true)}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Publish & Grid Guide Modal */}
      <PublishGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Quota / Login Modal */}
      <QuotaModal
        isOpen={quotaModal.open}
        onClose={() => setQuotaModal((prev) => ({ ...prev, open: false }))}
        snapshot={quota}
        serviceError={quotaModal.serviceError}
        onLogin={handleLogin}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>微信视频号多宫格封面智能切割工具 · 纯前端本地高效处理 · 零上传安全保障</span>
          <span className="text-slate-400">支持 1×3、2×3、3×3 及自定义矩阵切割 · 自动顺序打包</span>
        </div>
      </footer>
    </div>
  );
}
