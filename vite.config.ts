/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages ではリポジトリ名の下に置かれるので、相対パスで出力する
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
