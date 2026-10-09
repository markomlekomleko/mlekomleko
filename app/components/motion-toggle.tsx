"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mleko-i-mleko-motion";

// The marquees (and anything else that opts in) stop on :root[data-motion="paused"].
function applyMotion(paused: boolean) {
  if (paused) document.documentElement.dataset.motion = "paused";
  else delete document.documentElement.dataset.motion;
}

/** Site-wide pause for looping motion, remembered per browser (WCAG 2.2.2). */
export function MotionToggle() {
  const [paused, setPaused] = useState(false);

  // Storage is read only after mount, so the server and the first client render agree.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Blocked storage: motion simply starts on.
    }
    if (stored !== "paused") return;
    applyMotion(true);
    queueMicrotask(() => setPaused(true));
  }, []);

  function toggle() {
    const next = !paused;
    setPaused(next);
    applyMotion(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, "paused");
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The choice still holds for this page view.
    }
  }

  return (
    <button
      type="button"
      className="motion-toggle"
      aria-pressed={paused}
      aria-label="Zaustavi animacije"
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
        {paused ? <path d="M4.5 2.75v10.5L13 8z" /> : <path d="M3.5 2.75h3v10.5h-3zM9.5 2.75h3v10.5h-3z" />}
      </svg>
    </button>
  );
}
