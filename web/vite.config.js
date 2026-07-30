import { resolve } from 'path';
import { defineConfig } from 'vite';

// Три отдельные страницы — та же структура, что и раньше
// (index/part1/part2), просто теперь через настоящую сборку:
// three.js приходит из npm, а не из vendor-файла, мелкие модули
// (controls, detail, progress...) собираются и минифицируются,
// а не грузятся россыпью отдельными <script> тегами.
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        part1: resolve(__dirname, 'part1.html'),
        part2: resolve(__dirname, 'part2.html')
      },
      output: {
        // three.js — в свой собственный чанк. Он весит больше всего
        // и меняется реже всего (версия зафиксирована в package.json),
        // поэтому браузер должен кэшировать его отдельно от кода игры —
        // без этого правила Rollup случайно склеил three.js с одним
        // из мелких модулей в один 620-килобайтный файл.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
