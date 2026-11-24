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
 *
 * Nothing here waits a fixed time. A capture waits for the page's own signals instead: the load
 * event, `document.fonts.ready`, every image's load, a rendered frame, and the `finished` promise
 * of every finite animation and transition still running.
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

/**
 * Resolves once the page has nothing left to draw: two frames have rendered, so intersection
 * observers and class changes from the last scroll or click have run and started their
 * transitions; fonts and images have loaded; and every animation that ends has ended. An
 * animation that repeats forever is skipped, since it never settles. Lazy images are made eager
 * first, because one outside the viewport would otherwise never load.
 */
const settle = (page) =>
    page.evaluate(async () => {
        const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        await frame();
        await document.fonts.ready;
        await Promise.all(
            [...document.images].map((image) => {
                image.loading = 'eager';
                return image.complete
                    ? null
                    : new Promise((done) => {
                          image.addEventListener('load', done, { once: true });
                          image.addEventListener('error', done, { once: true });
                      });
            })
        );
        await Promise.all(
            document
                .getAnimations()
                .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
                // A cancelled animation rejects `finished`; it has stopped drawing all the same.
                .map((animation) => animation.finished.catch(() => null))
        );
        await frame();
    });
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
        await page.goto(config.base + path, { waitUntil: 'load' });
        await settle(page);
        // Content that starts when it scrolls into view (a reveal, a print, a drawn chart) never starts in a
        // full-page capture of an unscrolled page, so walk the page half a viewport at a time first,
        // letting two frames render at each stop so its intersection observers fire.
        await page.evaluate(async () => {
            const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
                scrollTo(0, y);
                await frame();
            }
            scrollTo(0, 0);
        });
        await settle(page);
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
        await page.goto(config.base + state.path, { waitUntil: 'load' });
        await settle(page);
        const target = page
            .locator((mode.mobile && state.clickMobile) || state.click)
            .filter({ visible: true })
            .first();
        if ((await target.count()) === 0) {
            console.log(`MISSING ${id} ${mode.id}: no visible element matches the click selector`);
            continue;
        }
        await target.click();
        await settle(page);
        await page.screenshot({ path: `${outDir}/${id}-${mode.id}.png` });
    }
    await context.close();
}
await browser.close();
