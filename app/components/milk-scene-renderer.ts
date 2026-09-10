import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight,
  Material, Mesh, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace,
  Texture, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type MilkSceneController = { destroy: () => void; turn: (direction: number) => void; pause: (paused: boolean) => void };

function disposeModel(root: Group | Scene) {
  const geometries = new Set<import("three").BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
}

/** The actual local Blender export. Download/render only when the desktop enhancement is allowed. */
export function mountMilkScene(host: HTMLElement, onReady: (ready: boolean) => void): MilkSceneController {
  const abort = new AbortController();
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, .1, 30);
  const assembly = new Group();
  scene.add(assembly);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .7;
  room.dispose(); pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0x718361, 1.3));
  const key = new DirectionalLight(0xfff3df, 2);
  key.position.set(-3, 4, 5); scene.add(key);
  const fill = new DirectionalLight(0xe4f0ff, .7);
  fill.position.set(4, 3, 2); scene.add(fill);
  const hero = host.closest<HTMLElement>(".conversion-hero") ?? host;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false, loaded = false, visible = true, paused = false;
  let frame = 0, lastTime = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, scroll = 0, turn = 0;
  host.appendChild(renderer.domElement);

  const draw = (time: number) => {
    frame = 0;
    if (disposed || !loaded || !visible || document.hidden || motion.matches) { lastTime = 0; return; }
    const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
    lastTime = time;
    if (!paused) elapsed += dt;
    const t = elapsed / 1000;
    const targetY = pointerX * .2 + scroll * .24 + turn;
    const targetX = pointerY * .06;
    assembly.rotation.y += (targetY - assembly.rotation.y) * .085;
    assembly.rotation.x += (targetX - assembly.rotation.x) * .085;
    assembly.position.y = Math.sin(t * .8) * .025 + scroll * .07;
    assembly.rotation.z = Math.sin(t * .55) * .012;
    renderer.render(scene, camera);
    host.dataset.ready = "true";
    if (!paused || Math.abs(targetY - assembly.rotation.y) + Math.abs(targetX - assembly.rotation.x) > .001) frame = requestAnimationFrame(draw);
  };
  const invalidate = () => {
    if (!disposed && loaded && !frame && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const resize = () => {
    if (!host.clientWidth || !host.clientHeight || disposed) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.position.set(0, 2.65, camera.aspect < .8 ? 7.5 : 6.7);
    camera.lookAt(0, 1.55, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    invalidate();
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const bounds = hero.getBoundingClientRect();
    pointerX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointerY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
    invalidate();
  };
  const resetPointer = () => { pointerX = pointerY = 0; invalidate(); };
  const onScroll = () => {
    if (!visible) return;
    scroll = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / hero.offsetHeight));
    invalidate();
  };
  const onVisibility = () => { if (document.hidden) stop(); else invalidate(); };
  const onMotion = () => {
    if (motion.matches) { stop(); delete host.dataset.ready; onReady(false); }
    else { onReady(loaded); invalidate(); }
  };
  const onLost = (event: Event) => { event.preventDefault(); cleanup(); };
  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { onScroll(); invalidate(); } else stop();
  });
  resizeObserver.observe(host); intersectionObserver.observe(host);
  hero.addEventListener("pointermove", onPointer, { passive: true });
  hero.addEventListener("pointerleave", resetPointer);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  resize();

  void (async () => {
    const response = await fetch("/models/milk-bottles.glb", { signal: abort.signal });
    if (!response.ok) throw new Error("Product scene unavailable");
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
    if (disposed) { disposeModel(gltf.scene); return; }
    assembly.add(gltf.scene);
    loaded = true;
    onReady(!motion.matches);
    invalidate();
  })().catch(() => { if (!disposed) cleanup(); });

  function cleanup() {
    if (disposed) return;
    disposed = true; abort.abort(); stop();
    resizeObserver.disconnect(); intersectionObserver.disconnect();
    hero.removeEventListener("pointermove", onPointer);
    hero.removeEventListener("pointerleave", resetPointer);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    motion.removeEventListener("change", onMotion);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    disposeModel(scene); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    delete host.dataset.ready;
    onReady(false);
  }
  return {
    destroy: cleanup,
    turn: (direction) => { turn += direction * Math.PI / 6; invalidate(); },
    pause: (value) => { paused = value; invalidate(); },
  };
}
