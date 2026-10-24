#!/usr/bin/env node
/**
 * Rasterize the generated SVG sheets (biome tilesets, characters) to PNG with headless
 * Chromium (SVG filters included).
 *
 *   node tools/render_svg.js                  # all public/assets/svg/*.svg
 *   node tools/render_svg.js map_sprites_desert.svg
 *   node tools/render_svg.js characters.svg
 *
 * Output goes to public/assets/images/<name>.png. Requires playwright (npm i -D playwright
 * or a globally installed copy via NODE_PATH).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SVG_DIR = path.join(__dirname, '..', 'public', 'assets', 'svg');
const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'images');

(async () => {
    const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const file of files) {
        const svg = fs.readFileSync(path.join(SVG_DIR, path.basename(file)), 'utf8');
        const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
        await page.setViewportSize({ width: +w, height: +h });
        await page.setContent('<html><body style="margin:0;background:transparent">' + svg + '</body></html>');
        await page.waitForTimeout(200);
        const out = path.join(OUT_DIR, path.basename(file, '.svg') + '.png');
        await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: +w, height: +h } });
        console.log('wrote', path.relative(process.cwd(), out));
    }
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
