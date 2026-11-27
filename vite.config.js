import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Inhaltsrichtlinie je Ziel: Das Programm lädt nie etwas aus dem Netz.
const CSP = {
  // Desktop-Programm: nur eigene Dateien, keine Inline-Skripte
  app: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; form-action 'none'; base-uri 'none'",
  // Einzeldatei für den Browser: alles steht in der Datei selbst
  standalone: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'",
  // Entwicklungsserver (nur lokal): zusätzlich die Verbindung für das automatische Neuladen
  dev: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; form-action 'none'; base-uri 'none'"
};

// Versionsnummer aus package.json – steht oben links im Programm, auch in der Einzeldatei für den Browser
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig(({ command, mode }) => {
  const standalone = mode === 'standalone';
  const csp = command === 'serve' ? CSP.dev : standalone ? CSP.standalone : CSP.app;
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(VERSION) },
    plugins: [
      { name: 'm1-csp', transformIndexHtml: html => html.replace('__CSP__', csp) },
      ...(standalone ? [viteSingleFile()] : [])
    ],
    build: {
      outDir: standalone ? 'dist/standalone' : 'dist/app',
      emptyOutDir: true,
      target: 'es2022',
      minify: false,          // bewusst lesbar: der ausgelieferte Code bleibt prüfbar
      cssMinify: false,
      modulePreload: false,
      reportCompressedSize: false
    },
    server: { port: 5173, strictPort: true },
    test: { include: ['tests/**/*.test.js'], environment: 'node' }
  };
});
