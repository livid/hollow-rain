#!/usr/bin/env node
// Renders Hollow Rain outside the browser, using the same engine code as index.html.
//
//   node render.mjs                         one seamless loop -> loop.mp4 (1920x1080, 30 fps)
//   node render.mjs --fps 60 --out a.mp4    choose frame rate / output file
//   node render.mjs --still 42 --out a.png  a single frame at t = 42 s
//   node render.mjs --check                 seam test (t = 0 vs t = T) and render speed
//   node render.mjs --wav                   only the soundtrack -> soundtrack.wav (48 kHz)
//   node render.mjs --no-audio              video without the soundtrack
//
// Make a 10-hour file (300 x 2 min). Loop the lossless WAV rather than the AAC track in the
// mp4, so the audio repeats sample-exact with no gap at each loop point:
//   ffmpeg -stream_loop 299 -i loop.mp4 -stream_loop 299 -i soundtrack.wav \
//          -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k tenhours.mp4

import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!src) throw new Error('engine <script id="engine"> block not found in index.html');
const E = new Function(`${src[1]}\nreturn HollowRain;`)();
const msrc = html.match(/<script id="music">([\s\S]*?)<\/script>/);
const M = msrc ? new Function(`${msrc[1]}\nreturn HollowMusic;`)() : null;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const has = (name) => args.includes(`--${name}`);

const W = E.BASE_W, H = E.BASE_H, SCALE = Number(opt('scale', 4));
const OW = W * SCALE, OH = H * SCALE;
const rawIn = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`];
const upscale = ['-vf', `scale=${OW}:${OH}:flags=neighbor`];

function ffmpeg(argv) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return { stdin: p.stdin, done };
}

// 16-bit stereo PCM WAV of one soundtrack loop, thunder synced to the lightning.
function writeSoundtrack(path, sr = 48000) {
  const { left, right } = M.render(sr, { thunder: E.FLASH_TIMES });
  const n = left.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const s16 = (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  for (let i = 0; i < n; i++) { b.writeInt16LE(s16(left[i]), 44 + i * 4); b.writeInt16LE(s16(right[i]), 46 + i * 4); }
  writeFileSync(path, b);
  console.log(`wrote ${path} (${(n / sr).toFixed(1)} s, ${sr} Hz stereo)`);
}

function write(stream, chunk) {
  return stream.write(chunk) ? Promise.resolve() : new Promise((r) => stream.once('drain', r));
}

if (has('check')) {
  const a = E.createScene(W, H), b = E.createScene(W, H);
  const fa = Buffer.from(a.render(0)), fb = Buffer.from(b.render(E.T));
  let diff = 0;
  for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) diff++;
  console.log(diff === 0 ? 'seam: OK (t=0 and t=T identical)' : `seam: MISMATCH in ${diff} bytes`);
  const n = 240, t0 = performance.now();
  for (let i = 0; i < n; i++) a.render(i / 30);
  console.log(`speed: ${((performance.now() - t0) / n).toFixed(2)} ms/frame at ${W}x${H}`);
  process.exit(diff === 0 ? 0 : 1);
} else if (has('wav')) {
  writeSoundtrack(opt('out', 'soundtrack.wav'));
} else if (has('still')) {
  const t = Number(opt('still', 0));
  const out = opt('out', `still-${t}.png`);
  const scene = E.createScene(W, H);
  const ff = ffmpeg([...rawIn, '-i', '-', ...upscale, '-frames:v', '1', out]);
  await write(ff.stdin, Buffer.from(scene.render(t)));
  ff.stdin.end();
  await ff.done;
  console.log(`wrote ${out} (t=${t}s, ${OW}x${OH})`);
} else {
  const fps = Number(opt('fps', 30));
  const out = opt('out', 'loop.mp4');
  const frames = Math.round(E.T * fps);
  const scene = E.createScene(W, H);
  const audio = M && !has('no-audio');
  if (audio) writeSoundtrack('soundtrack.wav');
  const ff = ffmpeg([
    ...rawIn, '-r', String(fps), '-i', '-',
    ...(audio ? ['-i', 'soundtrack.wav', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k'] : []),
    ...upscale,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '16'), '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-g', String(fps * 2), '-movflags', '+faststart', out,
  ]);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    await write(ff.stdin, Buffer.from(scene.render(i / fps)));
    if (i % (fps * 10) === 0) process.stdout.write(`\rframe ${i}/${frames}`);
  }
  ff.stdin.end();
  await ff.done;
  console.log(`\rwrote ${out}: ${frames} frames, ${E.T}s at ${fps} fps, ${OW}x${OH} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
