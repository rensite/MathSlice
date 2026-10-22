import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const localChromium = '/home/codexdev/.hermes/tools/chromium-1208/chrome-linux64/chrome';
const localLibs = '/home/codexdev/.hermes/cache/scratch/chromium-libs/root/usr/lib/x86_64-linux-gnu';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    viewport: { width: 1440, height: 960 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(existsSync(localChromium) ? { executablePath: localChromium } : {}),
      args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      env: { ...process.env, ...(existsSync(localLibs) ? { LD_LIBRARY_PATH: localLibs } : {}), ...(existsSync('/home/codexdev/.hermes/cache/scratch/sectionlab-fonts.conf') ? { FONTCONFIG_FILE: '/home/codexdev/.hermes/cache/scratch/sectionlab-fonts.conf' } : {}) }
    }
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
