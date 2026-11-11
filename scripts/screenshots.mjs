// Renders the HUD headlessly in each state. Uses the `?demo=` mode, so no mic or bridge is needed.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = new URL('../docs/screenshots/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();

const launch = async () => {
  try { return await chromium.launch(); }
  catch { return chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' }); }
};
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const shots = [
  ['idle', 'demo=idle'],
  ['listening', 'demo=listening'],
  ['thinking', 'demo=thinking'],
  ['speaking', 'demo=speaking'],
  ['calendar-panel', 'demo=speaking&panel=calendar'],
];
for (const [name, query] of shots) {
  await page.goto(`http://127.0.0.1:5199/?${query}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}${name}.png` });
  console.log('wrote', `docs/screenshots/${name}.png`);
}
await browser.close();
await server.close();
