export interface GridConfig {
  rows: number;
  cols: number;
  // Normalized cut line positions (0 to 1)
  // For cols columns, there are (cols - 1) vertical split lines
  verticalLines: number[]; // e.g. [0.3333, 0.6666]
  // For rows rows, there are (rows - 1) horizontal split lines
  horizontalLines: number[]; // e.g. [0.5]
}

export interface ImageMeta {
  file: File | null;
  name: string;
  width: number;
  height: number;
  size: number;
  type: string;
  objectUrl: string;
  imageElement: HTMLImageElement | null;
}

export interface SliceItem {
  id: string;
  index: number; // 0-based sequential (left-to-right, top-to-bottom)
  displayOrder: number; // 1-based order: 1, 2, 3...
  publishOrder: number; // WeChat upload order (depending on mode)
  row: number; // 0-based
  col: number; // 0-based
  x: number; // source pixels
  y: number; // source pixels
  width: number; // source pixels
  height: number; // source pixels
  aspectRatio: number; // width / height
  dataUrl: string;
  blob?: Blob;
  filename: string;
}

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export type PublishOrderMode = 
  | 'sequential' // 正序发布 (01 -> 02 -> 03...)
  | 'reverse_profile'; // 逆序发布 (为了主页拼图从左上到右下显示，按 09 -> 01 顺序发布)

export type OutputSizeMode = 'original' | 'standard_3_4' | 'standard_6_7';

export interface ExportSettings {
  format: ExportFormat;
  quality: number; // 0.1 - 1.0 (for jpeg / webp)
  prefix: string;
  publishOrderMode: PublishOrderMode;
  outputSizeMode: OutputSizeMode;
  includeReadme: boolean;
}
