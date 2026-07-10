import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  root: 'public',
  publicDir: false,
  plugins: [
    svelte(),
    viteSingleFile({
      removeViteModuleLoader: true
    })
  ],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/sidebar'),
      '$components': path.resolve(__dirname, './src/sidebar/components'),
      '$stores': path.resolve(__dirname, './src/sidebar/stores'),
      '$services': path.resolve(__dirname, './src/sidebar/services'),
      '$shared': path.resolve(__dirname, './src/shared')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'sidebar.js',
        assetFileNames: 'sidebar.[ext]'
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true
      }
    }
  }
});
