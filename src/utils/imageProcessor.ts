import JSZip from 'jszip';
import { GridConfig, SliceItem, ExportSettings } from '../types';

/**
 * Sanitizes a user-supplied filename prefix so it cannot break out of the ZIP
 * folder (zip-slip) or produce invalid/unsafe filenames.
 * Strips path separators, parent-dir sequences, control chars, and reserved names.
 */
export function sanitizeFilenamePrefix(prefix: string): string {
  if (!prefix) return '视频号封面';
  let s = prefix;
  // Remove path separators and NUL/control chars
  s = s.replace(/[/\\]/g, '').replace(/[\x00-\x1f\x7f]/g, '');
  // Collapse ".." sequences that remain after stripping separators
  s = s.replace(/\.{2,}/g, '.');
  // Trim leading dots/spaces and trailing dots/spaces (Windows dislikes trailing dots)
  s = s.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');
  // Collapse runs of whitespace
  s = s.replace(/\s+/g, ' ');
  // Limit length to keep filenames sane
  if (s.length > 40) s = s.slice(0, 40).trim();
  return s || '视频号封面';
}

/**
 * Generates initial equal split line coordinates for a given row and col count
 */
export function getEqualSplitLines(rows: number, cols: number): { verticalLines: number[]; horizontalLines: number[] } {
  const verticalLines: number[] = [];
  for (let c = 1; c < cols; c++) {
    verticalLines.push(c / cols);
  }

  const horizontalLines: number[] = [];
  for (let r = 1; r < rows; r++) {
    horizontalLines.push(r / rows);
  }

  return { verticalLines, horizontalLines };
}

/**
 * Calculates slice bounding boxes in source pixel coordinates
 */
export function calculateSliceBoxes(
  imgWidth: number,
  imgHeight: number,
  grid: GridConfig,
  publishOrderMode: ExportSettings['publishOrderMode'],
  prefix: string,
  extension: string
): Omit<SliceItem, 'dataUrl' | 'blob'>[] {
  const vLines = [0, ...grid.verticalLines, 1].sort((a, b) => a - b);
  const hLines = [0, ...grid.horizontalLines, 1].sort((a, b) => a - b);

  const boxes: Omit<SliceItem, 'dataUrl' | 'blob'>[] = [];
  const totalItems = (vLines.length - 1) * (hLines.length - 1);

  let index = 0;
  for (let r = 0; r < hLines.length - 1; r++) {
    for (let c = 0; c < vLines.length - 1; c++) {
      const leftRatio = Math.max(0, Math.min(1, vLines[c]));
      const rightRatio = Math.max(0, Math.min(1, vLines[c + 1]));
      const topRatio = Math.max(0, Math.min(1, hLines[r]));
      const bottomRatio = Math.max(0, Math.min(1, hLines[r + 1]));

      const x = Math.round(leftRatio * imgWidth);
      const y = Math.round(topRatio * imgHeight);
      const w = Math.max(1, Math.round(rightRatio * imgWidth) - x);
      const h = Math.max(1, Math.round(bottomRatio * imgHeight) - y);

      const displayOrder = index + 1;
      
      // Calculate WeChat publishing sequential order
      // In reverse mode: the last index (bottom-right) or bottom-left is published first so that top-left ends up as the newest video
      const publishOrder = publishOrderMode === 'reverse_profile'
        ? totalItems - index
        : displayOrder;

      const orderStr = String(displayOrder).padStart(2, '0');
      const safePrefix = sanitizeFilenamePrefix(prefix);
      const filename = `${safePrefix}_${orderStr}.${extension}`;

      boxes.push({
        id: `slice-${r}-${c}`,
        index,
        displayOrder,
        publishOrder,
        row: r,
        col: c,
        x,
        y,
        width: w,
        height: h,
        aspectRatio: Number((w / h).toFixed(4)),
        filename,
      });

      index++;
    }
  }

  return boxes;
}

/**
 * Slices an image element according to calculated boxes using OffscreenCanvas / HTML5 Canvas
 */
export async function executeSliceImage(
  imageElement: HTMLImageElement,
  grid: GridConfig,
  settings: ExportSettings,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<SliceItem[]> {
  const extension = settings.format === 'image/png' ? 'png' : settings.format === 'image/webp' ? 'webp' : 'jpg';
  const rawBoxes = calculateSliceBoxes(
    imageElement.naturalWidth,
    imageElement.naturalHeight,
    grid,
    settings.publishOrderMode,
    settings.prefix || '视频号封面',
    extension
  );

  const total = rawBoxes.length;
  const resultSlices: SliceItem[] = [];

  for (let i = 0; i < total; i++) {
    const box = rawBoxes[i];
    
    // Determine target slice canvas dimensions
    let targetWidth = box.width;
    let targetHeight = box.height;

    // If standard 3:4 target is requested, fit or fill with clean aspect
    if (settings.outputSizeMode === 'standard_3_4') {
      targetWidth = 1080;
      targetHeight = 1440;
    } else if (settings.outputSizeMode === 'standard_6_7') {
      targetWidth = 1080;
      targetHeight = 1260;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    if (!ctx) {
      throw new Error('无法创建 2D 渲染上下文');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (settings.outputSizeMode === 'original') {
      // Direct 1:1 pixel copy of the crop box
      ctx.drawImage(
        imageElement,
        box.x,
        box.y,
        box.width,
        box.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
    } else {
      // Fill canvas proportionally, centering image
      ctx.drawImage(
        imageElement,
        box.x,
        box.y,
        box.width,
        box.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    // Export to Blob and DataURL
    const dataUrl = canvas.toDataURL(settings.format, settings.quality);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), settings.format, settings.quality)
    );

    resultSlices.push({
      ...box,
      dataUrl,
      blob: blob || undefined,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / total) * 100), i + 1, total);
    }
    
    // Yield execution to keep browser responsive
    await new Promise((r) => setTimeout(r, 8));
  }

  return resultSlices;
}

/**
 * Creates and downloads a ZIP archive containing all slices and a README guide
 */
export async function downloadSlicesZip(
  slices: SliceItem[],
  zipFilename: string = '视频号多宫格封面包.zip',
  settings: ExportSettings
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('视频号封面切割图') || zip;

  // Add slices to zip
  for (const slice of slices) {
    if (slice.blob) {
      folder.file(slice.filename, slice.blob);
    } else if (slice.dataUrl) {
      const base64Data = slice.dataUrl.split(',')[1];
      folder.file(slice.filename, base64Data, { base64: true });
    }
  }

  // Include a helpful WeChat Channels publishing instruction text inside the zip
  if (settings.includeReadme) {
    const readmeContent = `=====================================================
微信视频号 - 多宫格封面发布顺序说明指南
=====================================================
生成时间: ${new Date().toLocaleString()}
切图总数: ${slices.length} 张 (${slices[0]?.width || 0} x ${slices[0]?.height || 0} 像素)

【核心发布技巧】：
因为微信视频号个人主页的作品列表是【从上到下、从左到右】展示，最新发布的视频会自动占据左上角第1格！

1. 推荐发布顺序（从底部往顶部发）：
   若您要让主页呈现完美的完整大图海报效果：
   - 先发布最后一行（例如九宫格的第 07、08、09 张）
   - 再发布中间一行（第 04、05、06 张）
   - 最后发布第一行（第 01、02、03 张）
   这样最新发布的 01、02、03 就会刚好在主页最顶部展示，拼成完整巨幅画面！

2. 封面安全区提醒：
   视频号在移动端播放时，底部约 15% 区域会有视频标题、头像和互动按钮，建议核心人物/文案避开底部。

祝您的视频号作品条条大爆！
=====================================================
`;
    folder.file('发布顺序与视频号排版指南.txt', readmeContent);
  }

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger download
  const downloadUrl = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000);
}

/**
 * Downloads a single slice image
 */
export function downloadSingleSlice(slice: SliceItem) {
  const anchor = document.createElement('a');
  anchor.href = slice.dataUrl;
  anchor.download = slice.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Copies a slice image directly to the system clipboard
 */
export async function copySliceToClipboard(slice: SliceItem): Promise<boolean> {
  try {
    if (!slice.blob) return false;
    // Clipboard API requires png image format
    const img = new Image();
    img.src = slice.dataUrl;
    await new Promise((resolve) => (img.onload = resolve));

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return false;

    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlob,
      }),
    ]);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}

/**
 * Generates an artistic demo poster on the fly so the user can test the cutting tool immediately
 */
export function createDemoPoster(preset: '1x3' | '2x3' | '3x3'): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    let width = 3240;
    let height = 1440;
    let rows = 1;
    let cols = 3;

    if (preset === '1x3') {
      width = 3240;
      height = 1440; // 3:4 each column (1080 x 1440)
      rows = 1;
      cols = 3;
    } else if (preset === '2x3') {
      width = 3240;
      height = 2880; // 2 rows of 1080 x 1440
      rows = 2;
      cols = 3;
    } else {
      width = 3240;
      height = 4320; // 3 rows of 1080 x 1440
      rows = 3;
      cols = 3;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Rich modern artistic dark cyber/oriental aesthetic gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.3, '#1e1b4b');
    grad.addColorStop(0.7, '#311042');
    grad.addColorStop(1, '#0c0a09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Draw glowing circles and artistic flowing waves
    ctx.save();
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const cx = (width / 7) * i + Math.sin(i) * 200;
      const cy = height * 0.5 + Math.cos(i) * 300;
      const r = 500 + Math.sin(i * 2) * 200;
      const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
      if (i % 2 === 0) {
        radial.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
        radial.addColorStop(0.5, 'rgba(239, 68, 68, 0.15)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        radial.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
        radial.addColorStop(0.5, 'rgba(147, 51, 234, 0.15)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = radial;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw decorative grid & golden ratio lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 4;
    for (let x = 0; x < width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();

    // Draw large artistic typography & elements across columns
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Main Title spanning across
    ctx.font = '900 180px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 40;
    ctx.fillText('视 频 号 · 连 贯 巨 幅 封 面', width / 2, height * 0.35);

    // Subtitle
    ctx.font = '600 72px "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 20;
    ctx.fillText('CHANNELS SMART GRID COVER POSTER', width / 2, height * 0.44);

    // Draw column content indicators
    const colWidth = width / cols;
    const rowHeight = height / rows;
    
    let cellIndex = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellCenterX = c * colWidth + colWidth / 2;
        const cellCenterY = r * rowHeight + rowHeight / 2;

        // Decorative corner brackets
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 6;
        const pad = 80;
        const len = 60;
        const left = c * colWidth + pad;
        const right = (c + 1) * colWidth - pad;
        const top = r * rowHeight + pad;
        const bottom = (r + 1) * rowHeight - pad;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(left, top + len);
        ctx.lineTo(left, top);
        ctx.lineTo(left + len, top);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(right - len, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right, top + len);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(left, bottom - len);
        ctx.lineTo(left, bottom);
        ctx.lineTo(left + len, bottom);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(right - len, bottom);
        ctx.lineTo(right, bottom);
        ctx.lineTo(right, bottom - len);
        ctx.stroke();

        // Number Badge
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.beginPath();
        ctx.roundRect(cellCenterX - 110, cellCenterY + 180, 220, 80, 40);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = '700 42px sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.shadowBlur = 0;
        ctx.fillText(`第 0${cellIndex} 视频封面`, cellCenterX, cellCenterY + 224);

        cellIndex++;
      }
    }

    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `视频号_${preset}_示例拼图海报.png`, { type: 'image/png' });
        resolve(file);
      }
    }, 'image/png');
  });
}
