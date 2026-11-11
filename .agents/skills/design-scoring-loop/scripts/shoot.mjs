/**
 * Captures a fixed screenshot set of a served web surface for one scoring round.
 *
 * Copy this file next to a `playwright-core` install (it resolves the package from its own
 * directory) and run:
 *
 *   node shoot.mjs <config.json> <outDir> [pageId...]
 *
 * Passing page ids captures only those pages. The config is JSON:
 *
 *   {
 *     "base": "http://localhost:4173/JSPrismarine/",
 *     "pages": { "home": "", "guide": "guide/" },
 *     "modes": [
 *       { "id": "light", "width": 1280, "height": 900, "scheme": "light" },
 *       { "id": "dark", "width": 1280, "height": 900, "scheme": "dark" },
 *       { "id": "mobile", "width": 390, "height": 844, "scheme": "light", "mobile": true }
 *     ],
 *     "crop": { "default": 1800, "mobile": 2400, "home": 3400 },
 *     "appearanceKey": "vitepress-theme-appearance",
 *     "states": { "menu": { "path": "guide/", "click": ".site-nav button[aria-expanded]", "clickMobile": ".site-phone__menu" } }
 *   }
 *
 * `crop` caps the capture height: a page id wins over a mode id, which wins over `default`.
 * `appearanceKey` is a localStorage key set to the mode's scheme before each load, for sites
 * that store a theme choice. `states` captures the viewport after a click on the first visible
 * match of the selector (`clickMobile` in mobile modes), such as an open menu.
 * Set `CHROME` to a browser binary when Playwright's own download is not used.
 * Every capture uses an explicit `en-US` locale and reduced motion; see the skill for why.
 */
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const [, , configPath, outDir, ...only] = process.argv;
if (!configPath || !outDir) {
    console.error('usage: node shoot.mjs <config.json> <outDir> [pageId...]');
    process.exit(2);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const wanted = (id) => only.length === 0 || only.includes(id);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const mode of config.modes) {
    const context = await browser.newContext({
        viewport: { width: mode.width, height: mode.height },
        colorScheme: mode.scheme,
        deviceScaleFactor: 1,
        isMobile: Boolean(mode.mobile),
        hasTouch: Boolean(mode.mobile),
        reducedMotion: 'reduce',
        locale: 'en-US'
    });
    if (config.appearanceKey) {
        await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [config.appearanceKey, mode.scheme]);
    }
    const page = await context.newPage();

    for (const [id, path] of Object.entries(config.pages)) {
        if (!wanted(id)) continue;
        await page.goto(config.base + path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (overflow > 0) console.log(`OVERFLOW ${id} ${mode.id} ${overflow}px`);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        const crop = config.crop?.[id] ?? config.crop?.[mode.id] ?? config.crop?.default ?? height;
        await page.screenshot({
            path: `${outDir}/${id}-${mode.id}.png`,
            fullPage: true,
            clip: { x: 0, y: 0, width: mode.width, height: Math.min(height, crop) },
            timeout: 60_000
        });
    }

    for (const [id, state] of Object.entries(config.states ?? {})) {
        if (!wanted(id)) continue;
        await page.goto(config.base + state.path, { waitUntil: 'networkidle' });
        const target = page
            .locator((mode.mobile && state.clickMobile) || state.click)
            .filter({ visible: true })
            .first();
        if ((await target.count()) === 0) {
            console.log(`MISSING ${id} ${mode.id}: no visible element matches the click selector`);
            continue;
        }
        await target.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${outDir}/${id}-${mode.id}.png` });
    }
    await context.close();
}
await browser.close();
