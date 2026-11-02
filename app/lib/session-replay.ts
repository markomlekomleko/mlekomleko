type Clarity = { (...args: unknown[]): void; q?: unknown[][] };
type ReplayWindow = Window & { clarity?: Clarity };
let loaded = false;

export function replayAllowed(path: string) {
  const normalized = path.replace(/^\/(en|ru|sr-cyrl|sr-latn)(?=\/|$)/, "");
  return /^\/(?:$|prodavnica\/?$|proizvodi\/[^/]+\/?$|farme\/?$|kako-funkcionise\/?$|faq\/?$)/.test(normalized);
}

export function updateReplayConsent(analytics: boolean, marketing: boolean) {
  (window as ReplayWindow).clarity?.("consentv2", { analytics_Storage: analytics ? "granted" : "denied", ad_Storage: marketing ? "granted" : "denied" });
  if (!analytics) (window as ReplayWindow).clarity?.("stop");
}

export function protectReplayRoute(path: string) {
  const allowed = replayAllowed(path) && !window.location.search && !window.location.hash;
  if (!allowed && loaded) {
    (window as ReplayWindow).clarity?.("stop");
    // A new document drops every vendor listener before sensitive forms are used.
    window.location.reload();
    return false;
  }
  return allowed;
}

/** Load only with explicit consent, on public catalog pages without query parameters. */
export function syncSessionReplay(analytics: boolean, marketing: boolean, path: string) {
  const w = window as ReplayWindow;
  const allowed = protectReplayRoute(path);
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  if (!analytics || !allowed || !projectId || !/^[a-z0-9]{5,32}$/i.test(projectId)) return;
  if (!loaded) {
    const clarity: Clarity = (...args: unknown[]) => { (clarity.q ??= []).push(args); };
    w.clarity = clarity;
    updateReplayConsent(analytics, marketing);
    const script = document.createElement("script"); script.async = true;
    script.src = `https://www.clarity.ms/tag/${projectId}`;
    script.id = "clarity-replay"; document.head.appendChild(script);
    loaded = true;
  } else updateReplayConsent(analytics, marketing);
}
