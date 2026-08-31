/**
 * Vite plugin: prerender-fallback.
 *
 * Problem: this app is pure client-side rendered (createRoot into #root). After `vite build`,
 * dist/index.html has an empty #root, so JS-less crawlers (and social-share fetchers that
 * don't execute JS) see a blank page — hurting SEO and OG link-card rendering.
 *
 * Solution: a lightweight post-build transform that injects a static, keyword-rich HTML
 * representation of the landing view (tool name, value props, 9-grid mockup, feature list)
 * *inside* #root. React still hydrates/replaces #root on the client, so no visual regression.
 * The injected markup is crawlable even without JS.
 *
 * Kept inline in vite.config.ts via this plugin so `npm run build` is the only command needed.
 * No puppeteer/browser dependency — the fallback HTML is hand-authored, mirroring the copy in
 * ImageUploader.tsx so the two stay in the same language/voice.
 */
import type { Plugin } from 'vite';

const FALLBACK_HTML = `
    <!-- ↓↓↓ prerendered fallback for crawlers / no-JS (replaced by React on load) ↓↓↓ -->
    <div class="prerender-fallback" style="max-width:1152px;margin:0 auto;padding:32px 16px;font-family:'Noto Sans SC',system-ui,sans-serif">
      <div style="text-align:center;margin-bottom:32px">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:9999px;background:#eff6ff;border:1px solid #dbeafe;color:#1d4ed8;font-size:13px;font-weight:600;margin-bottom:14px">纯前端高精算法 · 零压缩零画质损耗 · 本地隐私安全</div>
        <h1 style="font-size:30px;font-weight:800;color:#0f172a;margin:0">微信视频号 · 多宫格连贯封面智能切割</h1>
        <p style="margin:10px auto 0;max-width:640px;color:#475569;font-size:15px">专为视频号 1×3 三联横幅、2×3 六宫格、3×3 九宫格及长图海报打造。自动均分对齐，支持分割线实时拖拽微调，一键打包下载高清切图。</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:1024px;margin:0 auto">
        <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px">视频号 3 列标准适配</div>
          <div style="font-size:13px;color:#475569">固定适配微信主页 3 列流，支持 1~10 行自定义灵活扩展。</div>
        </div>
        <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px">分割线自由微调</div>
          <div style="font-size:13px;color:#475569">支持像素级拖拽切割线，完美解决画幅白边或微小拼图缝隙。</div>
        </div>
        <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
          <div style="font-weight:700;color:#0f172a;margin-bottom:4px">一键打包 01~0N</div>
          <div style="font-size:13px;color:#475569">按发布顺序编号导出 ZIP，附带微信视频号排版发布秘籍。</div>
        </div>
      </div>
      <p style="text-align:center;margin-top:32px;color:#94a3b8;font-size:13px">支持 JPG / PNG / WEBP · 拖拽或 Ctrl+V 粘贴上传 · 纯本地 Canvas 处理，绝不上云</p>
    </div>
    <noscript>
      <div style="max-width:720px;margin:48px auto;padding:0 24px;font-family:system-ui,sans-serif;text-align:center">
        <h2 style="font-size:24px;font-weight:800;color:#0f172a">视频号多宫格封面智能切割工具</h2>
        <p style="color:#475569;margin-top:10px">本工具需要启用 JavaScript 才能运行，请在浏览器设置中开启 JavaScript 后刷新页面。</p>
      </div>
    </noscript>`;

export function prerenderFallback(): Plugin {
  return {
    name: 'prerender-fallback',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Replace EVERYTHING inside #root with the fallback markup.
        // Vite moves modulepreload scripts into <head>, so the root's closing
        // </div> is followed by `</body>`, not `<script`. Match to the root's
        // own closing </div> (the first one after #root opens) regardless of
        // what follows — and drop any nested <noscript>/content the source had.
        return html.replace(
          /(<div id="root">)[\s\S]*?(<\/div>)/,
          (_m, open, close) => `${open}${FALLBACK_HTML}\n    ${close}`
        );
      },
    },
  };
}
