import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/lib/hero-playback.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { createHeroPlayback } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function video(loaded = true) {
  return {
    duration: loaded ? 8.04 : NaN, readyState: loaded ? 4 : 0,
    currentTime: 0, ended: false, muted: false, defaultMuted: false, playsInline: false,
    playbackRate: 1, playCalls: 0, pauseCalls: 0, paused: true,
    play() { this.playCalls++; this.paused = false; return Promise.resolve(); },
    pause() { this.pauseCalls++; this.paused = true; },
  };
}
function setup(initial = video()) {
  let current = initial;
  let id = 0;
  let ready = 0;
  const frames = new Map();
  const player = createHeroPlayback({
    video: () => current, duration: () => 8.04, onReady: () => ready++,
    requestFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelFrame: (key) => frames.delete(key),
  });
  return {
    player, frames, get ready() { return ready; },
    replace: (next) => { current = next; },
    tick: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0)); },
  };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('each segment accelerates and settles without seeking through intermediate frames', async () => {
  const clip = video();
  const { player, tick } = setup(clip);
  for (const step of [1, 2]) {
    const start = clip.currentTime;
    const end = step === 1 ? clip.duration * 0.65 : clip.duration - 0.025;
    player.move(step, true);
    assert.equal(clip.playbackRate, 1);
    await settle();
    const rates = [];
    for (const progress of [0.02, 0.06, 0.5, 0.92, 0.98]) {
      const time = start + (end - start) * progress;
      clip.currentTime = time;
      tick();
      assert.equal(clip.currentTime, time, 'easing changes playback speed, never the current frame');
      assert.equal(clip.paused, false);
      rates.push(clip.playbackRate);
    }
    assert.ok(rates[0] < rates[1] && rates[1] < rates[2]);
    assert.ok(rates[2] > rates[3] && rates[3] > rates[4]);
    assert.ok(rates.every((rate) => rate >= 1 && rate <= 4));
    clip.currentTime = end;
    tick();
    assert.equal(clip.paused, true);
  }
});

test('a swipe starts loading/playback even before mobile metadata exists', async () => {
  const clip = video(false);
  let resolvePlay;
  clip.play = function () { this.playCalls++; return new Promise((resolve) => { resolvePlay = resolve; }); };
  const { player, tick } = setup(clip);
  player.move(1, true);
  assert.equal(clip.playCalls, 1);
  assert.ok(clip.muted && clip.defaultMuted && clip.playsInline);
  clip.duration = 8.04;
  clip.readyState = 4;
  player.ready();
  assert.equal(clip.pauseCalls, 0, 'loadeddata must not interrupt the pending play request');
  assert.equal(clip.currentTime, 0, 'loading must not jump to the last frame');
  resolvePlay();
  await settle();
  clip.currentTime = 5.3;
  tick();
  assert.ok(Math.abs(clip.currentTime - 8.04 * 0.65) < 0.001);
  assert.equal(clip.paused, true);
});

test('a Safari policy rejection can be retried directly from touchend', async () => {
  const clip = video();
  clip.play = function () {
    this.playCalls++;
    return this.playCalls === 1 ? Promise.reject(new DOMException('Gesture required', 'NotAllowedError')) : Promise.resolve();
  };
  const { player, frames } = setup(clip);
  player.move(1, true);
  await settle();
  assert.equal(clip.currentTime, 0);
  player.retry();
  assert.equal(clip.playCalls, 2, 'retry must call play synchronously inside the gesture');
  await settle();
  assert.equal(frames.size, 1);
});

test('readiness events do not restart or pause a playing segment', async () => {
  const clip = video();
  const state = setup(clip);
  state.player.move(1, true);
  await settle();
  clip.currentTime = 2;
  state.player.ready();
  state.player.ready();
  state.tick();
  assert.equal(clip.playCalls, 1);
  assert.equal(clip.pauseCalls, 0);
  assert.equal(clip.currentTime, 2);
  assert.equal(state.ready, 1);
});

test('the next step cancels an older pending playback callback', async () => {
  const clip = video();
  const resolves = [];
  clip.play = function () { this.playCalls++; return new Promise((resolve) => resolves.push(resolve)); };
  const { player, frames, tick } = setup(clip);
  player.move(1, true);
  player.move(2, true);
  resolves[0]();
  await settle();
  assert.equal(frames.size, 0);
  resolves[1]();
  await settle();
  assert.equal(frames.size, 1);
  clip.currentTime = 8.02;
  tick();
  assert.equal(clip.paused, true);
  assert.equal(frames.size, 0);
});

test('late-mounted mobile video resumes the requested segment', async () => {
  const state = setup(null);
  state.player.move(1, true);
  const clip = video();
  state.replace(clip);
  state.player.ready();
  assert.equal(clip.playCalls, 1);
  await settle();
  assert.equal(state.frames.size, 1);
});

test('switching source pauses the old element and plays the new one', async () => {
  const oldClip = video();
  const state = setup(oldClip);
  state.player.move(1, true);
  await settle();
  const newClip = video();
  state.replace(newClip);
  state.player.ready();
  assert.equal(oldClip.paused, true);
  assert.equal(newClip.playCalls, 1);
});

test('returning to the first step resets the video without autoplay', async () => {
  const clip = video();
  const { player, frames } = setup(clip);
  player.move(1, true);
  await settle();
  clip.currentTime = 3;
  player.move(0, true);
  assert.equal(clip.currentTime, 0);
  assert.equal(clip.paused, true);
  assert.equal(frames.size, 0);
  assert.equal(clip.playCalls, 1);
});

test('unmounting prevents pending play promises from starting a frame loop', async () => {
  const clip = video();
  let resolvePlay;
  clip.play = () => new Promise((resolve) => { resolvePlay = resolve; });
  const { player, frames } = setup(clip);
  player.move(1, true);
  player.dispose();
  resolvePlay();
  await settle();
  assert.equal(frames.size, 0);
  assert.equal(clip.paused, true);
});
