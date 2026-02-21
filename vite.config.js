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
          // 将 fast-average-color 分离
          'vendor': ['fast-average-color', 'axios'],
        },
      },
    },
    // 提高 chunk 大小警告限制（因为包含了大量字体文件）
    chunkSizeWarningLimit: 1000,
  },
});
