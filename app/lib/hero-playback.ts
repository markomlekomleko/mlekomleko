export type HeroStep = 0 | 1 | 2;

type PlaybackOptions = {
  video: () => HTMLVideoElement | null;
  duration: () => number;
  onReady: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
};

/** Native playback that can start before metadata arrives and retry on touchend. */
export function createHeroPlayback(options: PlaybackOptions) {
  const request = options.requestFrame ?? requestAnimationFrame;
  const cancel = options.cancelFrame ?? cancelAnimationFrame;
  let step: HeroStep = 0;
  let frame = 0;
  let generation = 0;
  let attempting = false;
  let pending = false;
  let disposed = false;
  let activeVideo: HTMLVideoElement | null = null;
  let readyVideo: HTMLVideoElement | null = null;
  const reportReady = (video: HTMLVideoElement) => {
    if (video.readyState >= 2 && readyVideo !== video) {
      readyVideo = video;
      options.onReady();
    }
  };

  const targetFor = (video: HTMLVideoElement) => {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : options.duration();
    return step === 0 ? 0 : step === 1 ? duration * 0.65 : Math.max(0, duration - 0.025);
  };
  const seek = (video: HTMLVideoElement, target: number) => {
    // iOS may not expose a seekable timeline before metadata has loaded.
    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.025) video.currentTime = target;
  };
  const stop = () => {
    generation += 1;
    cancel(frame);
    frame = 0;
    attempting = false;
    pending = false;
    activeVideo?.pause();
    activeVideo = null;
  };

  const move = (next: HeroStep, animate: boolean) => {
    stop();
    if (disposed) return;
    step = next;
    const video = options.video();
    pending = animate && step > 0;
    if (!video) return;
    activeVideo = video;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const target = targetFor(video);
    if (!animate || target <= video.currentTime + 0.025) {
      pending = false;
      video.pause();
      seek(video, target);
      return;
    }

    const token = generation;
    attempting = true;
    const start = video.currentTime;
    const cruiseRate = Math.max(1, Math.min(4, (target - start) / (step === 1 ? 1.35 : 0.9)));
    const ease = (value: number) => {
      const t = Math.max(0, Math.min(1, value));
      return t * t * (3 - 2 * t);
    };
    // Ease native playback into and out of each segment without seeking between
    // frames. A positive minimum keeps short segments and mobile retries moving.
    video.playbackRate = 1;
    const tick = () => {
      if (disposed || token !== generation) return;
      reportReady(video);
      const end = targetFor(video);
      if (video.currentTime >= end || video.ended) {
        video.pause();
        seek(video, end);
        attempting = false;
        frame = 0;
      } else {
        const progress = (video.currentTime - start) / Math.max(0.025, end - start);
        const envelope = ease(progress / 0.12) * ease((1 - progress) / 0.18);
        video.playbackRate = 1 + (cruiseRate - 1) * envelope;
        frame = request(tick);
      }
    };

    // Call play now, even with HAVE_NOTHING: it starts loading on mobile. Keeping
    // this synchronous also lets retry() use the browser's touchend activation.
    void video.play().then(() => {
      if (disposed || token !== generation) return;
      pending = false;
      reportReady(video);
      frame = request(tick);
    }).catch(() => {
      if (disposed || token !== generation) return;
      attempting = false;
      pending = true;
      // Keep the first frame. Seeking to the end here hides a failed play request
      // and leaves mobile visitors with a still image instead of an animation.
    });
  };

  return {
    move,
    ready() {
      if (disposed) return;
      const video = options.video();
      if (!video) return;
      reportReady(video);
      // A loadeddata/canplay event must not pause an in-flight play() request.
      if (attempting && activeVideo === video) return;
      if (pending || (activeVideo && activeVideo !== video)) move(step, step > 0);
      else seek(video, targetFor(video));
    },
    retry() {
      if (pending && !disposed) move(step, true);
    },
    stop,
    dispose() { disposed = true; stop(); },
  };
}
