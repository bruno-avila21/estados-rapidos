import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SERVIDOR = path.resolve(AQUI, '..', '..', 'scripts', 'servir.js');
const PUERTO = 8991;

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    // Red mockeada en los specs: bloquear el SW para que sus fetch internos no escapen a
    // page.route (ver receta e2e.md, "Service Worker: verificarlo aparte de los E2E mockeados").
    serviceWorkers: 'block',
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  },
  projects: [
    {
      name: 'movil',
      use: { browserName: 'chromium', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `node "${SERVIDOR}" ${PUERTO}`,
    url: `http://127.0.0.1:${PUERTO}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
