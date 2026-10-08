/**
 * In-page probes for the visual capture tool.
 *
 * Every exported function here is serialised by Playwright and executed inside the
 * page, so each one must be fully self-contained: no imports, no references to module
 * scope, and helpers declared inside the function body.
 */

export type DigestElement = Record<string, string>;

export type DigestPayload = {
  /** Values that were elided from `elements` because they matched. */
  defaults: Record<string, string>;
  /** Border colours equal to the element's own `color` are elided (currentColor). */
  borderColorFallback: "color";
  elements: Record<string, DigestElement>;
};

/**
 * Walk `document.body` and record a computed-style digest keyed by a structural path
 * (`tag:nth-of-type(n)` chain from body, `::before`/`::after` appended for pseudos).
 *
 * Exclusions, all deterministic structure rather than loosened data:
 * - transition / animation properties are never recorded;
 * - non-rendered nodes (`script`, `style`, `link`, `meta`, `template`, `noscript`);
 * - Next.js framework nodes (`nextjs-portal`, `next-route-announcer`, `[data-nextjs-*]`),
 *   which only exist in dev or carry no design;
 * - children of `svg`, `video`, `audio`, `canvas`, `iframe` (the element itself is kept).
 */
export function collectDigest(): DigestPayload {
  const SKIP_TAGS = new Set([
    "script",
    "style",
    "link",
    "meta",
    "template",
    "noscript",
    "nextjs-portal",
    "next-route-announcer",
  ]);
  const LEAF_TAGS = new Set(["svg", "video", "audio", "canvas", "iframe"]);
  const SIDES = ["top", "right", "bottom", "left"];
  const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const OFFSETS = ["top", "right", "bottom", "left"];
  const PROPS = [
    "display",
    "position",
    ...SIDES.map((side) => `margin-${side}`),
    ...SIDES.map((side) => `padding-${side}`),
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variation-settings",
    "line-height",
    "letter-spacing",
    "text-transform",
    "text-align",
    "color",
    "background-color",
    "background-image",
    ...SIDES.flatMap((side) => [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`]),
    ...CORNERS.map((corner) => `border-${corner}-radius`),
    "box-shadow",
    "opacity",
    "transform",
    "z-index",
    "visibility",
    "overflow-x",
    "overflow-y",
    "grid-template-columns",
    "flex-direction",
    "justify-content",
    "align-items",
    "gap",
    "object-fit",
    "filter",
  ];
  const DEFAULTS: Record<string, string> = {
    position: "static",
    "font-style": "normal",
    "font-stretch": "100%",
    "font-variation-settings": "normal",
    "letter-spacing": "normal",
    "text-transform": "none",
    "text-align": "start",
    "background-color": "rgba(0, 0, 0, 0)",
    "background-image": "none",
    "box-shadow": "none",
    opacity: "1",
    transform: "none",
    "z-index": "auto",
    visibility: "visible",
    "overflow-x": "visible",
    "overflow-y": "visible",
    "grid-template-columns": "none",
    "flex-direction": "row",
    "justify-content": "normal",
    "align-items": "normal",
    gap: "normal",
    "object-fit": "fill",
    filter: "none",
  };
  for (const side of SIDES) {
    DEFAULTS[`margin-${side}`] = "0px";
    DEFAULTS[`padding-${side}`] = "0px";
    DEFAULTS[`border-${side}-width`] = "0px";
    DEFAULTS[`border-${side}-style`] = "none";
  }
  for (const corner of CORNERS) DEFAULTS[`border-${corner}-radius`] = "0px";

  const half = (value: number) => `${Math.round(value * 2) / 2}px`;
  const roundPx = (value: string) => {
    const match = /^(-?[\d.]+)px$/.exec(value);
    return match ? half(Number(match[1])) : value;
  };
  const skipped = (element: Element) => {
    if (SKIP_TAGS.has(element.localName)) return true;
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-nextjs")) return true;
    }
    return false;
  };
  const read = (style: CSSStyleDeclaration, size: { width: string; height: string }) => {
    const entry: DigestElement = {};
    const color = style.getPropertyValue("color");
    for (const prop of PROPS) {
      const value = style.getPropertyValue(prop);
      if (DEFAULTS[prop] === value) continue;
      if (prop.endsWith("-color") && prop.startsWith("border-") && value === color) continue;
      entry[prop] = value;
      if (prop === "position" && value !== "static") {
        for (const offset of OFFSETS) entry[offset] = style.getPropertyValue(offset);
      }
    }
    entry.width = size.width;
    entry.height = size.height;
    return entry;
  };

  const elements: Record<string, DigestElement> = {};
  const stack: Array<[Element, string]> = [[document.body, "body"]];
  while (stack.length) {
    const [element, path] = stack.pop()!;
    const rect = element.getBoundingClientRect();
    elements[path] = read(getComputedStyle(element), { width: half(rect.width), height: half(rect.height) });
    for (const pseudo of ["::before", "::after"] as const) {
      const style = getComputedStyle(element, pseudo);
      const content = style.getPropertyValue("content");
      if (content === "none" || content === "normal" || content === "") continue;
      elements[`${path}${pseudo}`] = read(style, {
        width: roundPx(style.getPropertyValue("width")),
        height: roundPx(style.getPropertyValue("height")),
      });
    }
    if (LEAF_TAGS.has(element.localName)) continue;
    const counts = new Map<string, number>();
    const children: Array<[Element, string]> = [];
    for (const child of Array.from(element.children)) {
      const tag = child.localName;
      const index = (counts.get(tag) ?? 0) + 1;
      counts.set(tag, index);
      if (!skipped(child)) children.push([child, `${path}>${tag}:nth-of-type(${index})`]);
    }
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return { defaults: DEFAULTS, borderColorFallback: "color", elements };
}

/**
 * Freeze motion deterministically: finite time-based animations jump to their end
 * state, infinite ones are parked on their first frame. Scroll-driven animations
 * (ViewTimeline/ScrollTimeline) are left alone because they are a pure function of
 * the scroll position, which the tool controls.
 */
export function freezeAnimations(): number {
  let frozen = 0;
  for (const animation of document.getAnimations()) {
    if (animation.timeline && !(animation.timeline instanceof DocumentTimeline)) continue;
    const timing = animation.effect?.getComputedTiming();
    if (!timing) continue;
    try {
      if (timing.iterations === Infinity || timing.endTime === Infinity) {
        animation.pause();
        animation.currentTime = 0;
      } else {
        animation.finish();
      }
      frozen += 1;
    } catch {
      animation.pause();
    }
  }
  return frozen;
}

/** Force lazy media to load and wait (bounded) until every image is decoded. */
export async function settleImages(timeoutMs: number): Promise<{ total: number; pending: number }> {
  const images = Array.from(document.images);
  for (const image of images) if (image.loading === "lazy") image.loading = "eager";
  const loaded = (image: HTMLImageElement) =>
    image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
  const all = Promise.all(images.map((image) => loaded(image).then(() => image.decode().catch(() => undefined))));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return { total: images.length, pending: images.filter((image) => !image.complete).length };
}

export type MarqueeReport = Array<{
  path: string;
  animationName: string;
  playState: string;
  animated: Array<{ path: string; animationName: string; playState: string; duration: string }>;
}>;

/** Animation state of every `.marquee` element and its animated descendants. */
export function collectMarquee(): MarqueeReport {
  const pathOf = (element: Element) => {
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node !== document.body) {
      const tag = node.localName;
      let index = 1;
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (sibling.localName === tag) index += 1;
      }
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    return ["body", ...parts].join(">");
  };
  return Array.from(document.querySelectorAll(".marquee")).map((marquee) => {
    const style = getComputedStyle(marquee);
    const animated = Array.from(marquee.querySelectorAll("*"))
      .map((element) => ({ element, style: getComputedStyle(element) }))
      .filter(({ style: own }) => own.animationName !== "none")
      .slice(0, 20)
      .map(({ element, style: own }) => ({
        path: pathOf(element),
        animationName: own.animationName,
        playState: own.animationPlayState,
        duration: own.animationDuration,
      }));
    return { path: pathOf(marquee), animationName: style.animationName, playState: style.animationPlayState, animated };
  });
}

export type ClsReport = { total: number; withoutRecentInput: number; entries: number; windowMs: number };

/** Sum of buffered layout-shift entries from navigation start until load + windowMs. */
export async function collectCls(windowMs: number): Promise<ClsReport> {
  type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean };
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const loadEnd = navigation?.loadEventEnd || performance.now();
  const until = loadEnd + windowMs;
  const wait = until - performance.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const shifts = await new Promise<Shift[]>((resolve) => {
    const collected: Shift[] = [];
    const observer = new PerformanceObserver((list) => {
      collected.push(...(list.getEntries() as Shift[]));
    });
    observer.observe({ type: "layout-shift", buffered: true });
    setTimeout(() => {
      collected.push(...(observer.takeRecords() as Shift[]));
      observer.disconnect();
      resolve(collected);
    }, 50);
  });
  const inWindow = shifts.filter((shift) => shift.startTime <= until);
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    total: round(inWindow.reduce((sum, shift) => sum + shift.value, 0)),
    withoutRecentInput: round(inWindow.filter((shift) => !shift.hadRecentInput).reduce((sum, shift) => sum + shift.value, 0)),
    entries: inWindow.length,
    windowMs,
  };
}

export type PageMetrics = ReturnType<typeof collectPageMetrics>;

/** Design metrics that are computed in the page (axe, CLS and hero data come from Node). */
export function collectPageMetrics() {
  const SKIP_TAGS = new Set([
    "script",
    "style",
    "link",
    "meta",
    "template",
    "noscript",
    "nextjs-portal",
    "next-route-announcer",
  ]);
  const LEAF_TAGS = new Set(["svg", "video", "audio", "canvas", "iframe"]);
  const pathOf = (element: Element) => {
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node !== document.body && node !== document.documentElement) {
      const tag = node.localName;
      let index = 1;
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        if (sibling.localName === tag) index += 1;
      }
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }
    return ["body", ...parts].join(">");
  };
  const label = (element: Element) => {
    const id = element.id ? `#${element.id}` : "";
    const classes = typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    return `${element.localName}${id}${classes}`;
  };
  const skipped = (element: Element) =>
    SKIP_TAGS.has(element.localName) ||
    Array.from(element.attributes).some((attribute) => attribute.name.startsWith("data-nextjs"));
  const half = (value: number) => Math.round(value * 2) / 2;

  // Every rendered element in body, in document order.
  const all: Element[] = [];
  const stack: Element[] = [document.body];
  while (stack.length) {
    const element = stack.pop()!;
    all.push(element);
    if (LEAF_TAGS.has(element.localName)) continue;
    const children = Array.from(element.children).filter((child) => !skipped(child));
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  const rects = new Map<Element, DOMRect>();
  const isVisible = (element: Element) => {
    let rect = rects.get(element);
    if (!rect) {
      rect = element.getBoundingClientRect();
      rects.set(element, rect);
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };
  const visible = all.filter(isVisible);

  // Horizontal overflow and the outermost elements that cause it.
  const root = document.documentElement;
  const overflowing = root.scrollWidth > root.clientWidth + 1;
  const clipsX = (element: Element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const value = getComputedStyle(node).overflowX;
      if (value !== "visible") return true;
    }
    return false;
  };
  const offenders = new Set<Element>();
  if (overflowing) {
    for (const element of all) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) continue;
      if ((rect.right > root.clientWidth + 1 || rect.left < -1) && !clipsX(element)) offenders.add(element);
    }
  }
  const horizontalOverflow = {
    overflowing,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    offenders: Array.from(offenders)
      .filter((element) => !element.parentElement || !offenders.has(element.parentElement))
      .slice(0, 30)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { path: pathOf(element), label: label(element), left: half(rect.left), right: half(rect.right) };
      }),
  };

  // Colour inventory across visible elements.
  const tally = (map: Map<string, number>, value: string) => map.set(value, (map.get(value) ?? 0) + 1);
  const text = new Map<string, number>();
  const background = new Map<string, number>();
  const border = new Map<string, number>();
  const ownText = (element: Element) =>
    Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== "");
  for (const element of visible) {
    const style = getComputedStyle(element);
    if (ownText(element)) tally(text, style.color);
    if (style.backgroundColor !== "rgba(0, 0, 0, 0)") tally(background, style.backgroundColor);
    for (const side of ["top", "right", "bottom", "left"]) {
      const width = parseFloat(style.getPropertyValue(`border-${side}-width`));
      const kind = style.getPropertyValue(`border-${side}-style`);
      if (width > 0 && kind !== "none" && kind !== "hidden") tally(border, style.getPropertyValue(`border-${side}-color`));
    }
  }
  const sorted = (map: Map<string, number>) =>
    Object.fromEntries(Array.from(map.entries()).sort((a, b) => b[1] - a[1]));
  const merged = new Map<string, number>();
  for (const map of [text, background, border]) for (const [value, count] of map) merged.set(value, (merged.get(value) ?? 0) + count);
  const colors = {
    unique: merged.size,
    all: sorted(merged),
    text: sorted(text),
    background: sorted(background),
    border: sorted(border),
  };

  // Rounded corners.
  const radiusList: Array<{ path: string; label: string; value: string }> = [];
  let radiusTotal = 0;
  for (const element of visible) {
    const style = getComputedStyle(element);
    const corners = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ];
    if (corners.some((corner) => parseFloat(corner) > 0)) {
      radiusTotal += 1;
      if (radiusList.length < 200) {
        const value = corners.every((corner) => corner === corners[0]) ? corners[0] : corners.join(" ");
        radiusList.push({ path: pathOf(element), label: label(element), value });
      }
    }
  }
  const radiusValues: Record<string, number> = {};
  for (const entry of radiusList) radiusValues[entry.value] = (radiusValues[entry.value] ?? 0) + 1;

  // Typography per role.
  const ROLES: Record<string, string> = {
    h1: "h1",
    h2: "h2",
    h3: "h3",
    eyebrow: ".eyebrow",
    button: ".button",
    body: "main p:not(.eyebrow)",
    configurator: ".configurator h2, .configurator h3, .configurator-title",
    nav: "header nav a, .main-nav a",
  };
  const fonts: Record<string, Array<Record<string, string | number>>> = {};
  for (const [role, selector] of Object.entries(ROLES)) {
    const groups = new Map<string, Record<string, string | number>>();
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (skipped(element)) continue;
      const style = getComputedStyle(element);
      const entry = {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStretch: style.fontStretch,
        fontStyle: style.fontStyle,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
      };
      const key = Object.values(entry).join("|");
      const group = groups.get(key) ?? { ...entry, count: 0, visible: 0, sample: pathOf(element) };
      group.count = Number(group.count) + 1;
      if (isVisible(element)) group.visible = Number(group.visible) + 1;
      groups.set(key, group);
    }
    fonts[role] = Array.from(groups.values());
  }

  // Headline words split across two lines.
  const brokenWords: Array<{ path: string; word: string; lines: number }> = [];
  for (const heading of Array.from(document.querySelectorAll("h1, h2"))) {
    if (!isVisible(heading)) continue;
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? "";
      for (const match of value.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const tops = new Set(
          Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0)
            .map((rect) => Math.round(rect.top)),
        );
        if (tops.size > 1) brokenWords.push({ path: pathOf(heading), word: match[0], lines: tops.size });
      }
    }
  }

  // Tap targets.
  type Target = { path: string; label: string; width: number; height: number; text: string; inline: boolean };
  const under44: Target[] = [];
  const under24: Target[] = [];
  let count44 = 0;
  let count24 = 0;
  for (const element of Array.from(
    document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]'),
  )) {
    if (!isVisible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width >= 44 && rect.height >= 44) continue;
    const target: Target = {
      path: pathOf(element),
      label: label(element),
      width: half(rect.width),
      height: half(rect.height),
      text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || element.getAttribute("aria-label") || "",
      inline: getComputedStyle(element).display === "inline",
    };
    count44 += 1;
    if (under44.length < 200) under44.push(target);
    if (rect.width < 24 || rect.height < 24) {
      count24 += 1;
      if (under24.length < 200) under24.push(target);
    }
  }
  const smallTapTargets = { under44Count: count44, under24Count: count24, under44, under24 };

  // Header stack versus the --header-stack token.
  const stackElement = document.querySelector<HTMLElement>(".site-header-stack");
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:0;left:0;width:1px;height:var(--header-stack);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const tokenPx = half(probe.getBoundingClientRect().height);
  probe.remove();
  const headerStack = {
    present: Boolean(stackElement),
    offsetHeight: stackElement?.offsetHeight ?? null,
    rectHeight: stackElement ? half(stackElement.getBoundingClientRect().height) : null,
    tokenRaw: getComputedStyle(document.documentElement).getPropertyValue("--header-stack").trim(),
    tokenPx,
    delta: stackElement ? half(stackElement.getBoundingClientRect().height - tokenPx) : null,
  };

  // Vertical rhythm of top-level sections.
  const sectionPaddings = Array.from(document.querySelectorAll("main > section, .home > section")).map((section) => {
    const style = getComputedStyle(section);
    return { path: pathOf(section), label: label(section), paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
  });

  // Font payload.
  const fontEntries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((entry) =>
    /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(entry.name),
  );
  const fontBytes = {
    transferBytes: fontEntries.reduce((sum, entry) => sum + entry.transferSize, 0),
    encodedBytes: fontEntries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    files: fontEntries.map((entry) => ({
      name: entry.name.replace(location.origin, ""),
      transfer: entry.transferSize,
      encoded: entry.encodedBodySize,
    })),
  };

  return {
    elementCount: all.length,
    visibleCount: visible.length,
    horizontalOverflow,
    colors,
    nonZeroRadius: { total: radiusTotal, values: radiusValues, elements: radiusList },
    fonts,
    brokenWords,
    smallTapTargets,
    headerStack,
    sectionPaddings,
    fontBytes,
  };
}
