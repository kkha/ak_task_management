import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 빌드 결과물(dist/index.html)을 CSS·JS가 모두 인라인된 단일 파일로 만든다.
// → 정적 호스팅뿐 아니라 파일 더블클릭(file://)으로도 그대로 열린다.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        preserveEntrySignatures: "strict",
      },
      treeshake: false,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
