import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Google Drive keeps re-creating hidden `desktop.ini` files inside synced folders.
// Vite's built-in public-dir copy picks them up and then fails with
// `ENOENT copyfile public/desktop.ini` (after already emptying dist/).
// For builds we copy public/ ourselves and skip those files.
const PUBLIC_DIR = path.resolve(__dirname, 'public')
const SKIP_PUBLIC_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])

function listPublicFiles(dir, base = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_PUBLIC_FILES.has(entry.name.toLowerCase())) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listPublicFiles(full, rel))
    else out.push({ rel, full })
  }
  return out
}

function copyPublicSkippingDriveFiles() {
  return {
    name: 'c2dpost-copy-public',
    apply: 'build',
    generateBundle() {
      for (const { rel, full } of listPublicFiles(PUBLIC_DIR)) {
        let source
        try {
          source = fs.readFileSync(full)
        } catch (err) {
          // File vanished mid-build (Drive sync) -> skip instead of failing the build
          this.warn(`skip public/${rel}: ${err.code || err.message}`)
          continue
        }
        this.emitFile({ type: 'asset', fileName: rel, source })
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), copyPublicSkippingDriveFiles()],
  // Dev server still serves public/ normally; build uses the plugin above
  publicDir: command === 'build' ? false : 'public',
  server: {
    port: 5173,
    watch: {
      ignored: ['**/extension_Webstore/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
}))
