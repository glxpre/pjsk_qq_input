import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 9000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 Material-UI 分离到单独的 chunk
          'mui': [
            '@mui/material',
            '@mui/icons-material',
            '@emotion/react',
            '@emotion/styled'
          ],
          // 将 fast-average-color 和 axios 分离
          'vendor': ['fast-average-color', 'axios'],
        },
      },
    },
    // 使用 terser 压缩（最佳压缩率）
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 移除所有 console
        drop_debugger: true, // 移除 debugger
        pure_funcs: ['console.log', 'console.info', 'console.debug'], // 额外确保移除
        passes: 2, // 两次压缩获得更好效果
      },
      mangle: {
        safari10: true, // Safari 10 兼容
      },
    },
    target: 'es2015',
    // 提高 chunk 大小警告限制
    chunkSizeWarningLimit: 1000,
    // CSS 代码分割
    cssCodeSplit: true,
  },
});
