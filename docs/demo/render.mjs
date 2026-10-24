// Render the composition frame by frame (deterministic seek) straight into ffmpeg.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const DIR = new URL('.', import.meta.url).pathname;
const FPS = 30;
const W = 1920, H = 1080;
const outFile = process.env.OUT ?? `${DIR}/404less-demo.mp4`;
const framesOnly = process.env.FRAMES; // e.g. "0,90,300" → write PNG stills instead of a video
const range = process.env.RANGE?.split(',').map(Number); // optional [startSec, endSec]

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`file://${DIR}/composition.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.__duration);
console.log('duration', duration, 's');

if (framesOnly) {
  fs.mkdirSync(`${DIR}/stills`, { recursive: true });
  for (const f of framesOnly.split(',').map(Number)) {
    await page.evaluate((t) => window.__seek(t), f / FPS);
    await page.screenshot({ path: `${DIR}/stills/f${String(f).padStart(5, '0')}.png` });
  }
  console.log('stills written');
  await browser.close();
  process.exit(0);
}

const start = range ? Math.floor(range[0] * FPS) : 0;
const end = range ? Math.ceil(range[1] * FPS) : Math.ceil(duration * FPS);
const args = [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-ss', String(start / FPS), '-i', `${DIR}/music.wav`, '-filter:a', 'volume=0.85',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  outFile,
];
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let f = start; f < end; f++) {
  await page.evaluate((t) => window.__seek(t), f / FPS);
  const buf = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if ((f - start) % 150 === 0) console.log(`frame ${f}/${end} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}`)))));
await browser.close();
console.log('wrote', outFile, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
