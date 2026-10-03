import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';

import { execFileSync } from 'node:child_process';
const buildId =
    process.env.EMMM_BUILD_ID ??
    execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    define: { __EMMM_BUILD_ID__: JSON.stringify(buildId) },
    plugins: [
        sveltekit(),
        visualizer({
            template: 'treemap',
            gzipSize: true,
        }),
    ],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            // 3. tell vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
}));
