import {
  ACESFilmicToneMapping, CanvasTexture, CatmullRomCurve3, CircleGeometry,
  Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Scene, SRGBColorSpace, Texture, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** A single, demand-rendered scene. No models, HDRs, frame sequences or motion runtime to download. */
export function mountMilkScene(host: HTMLElement) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { return () => {}; }
  try {
    return initializeMilkScene(host, renderer);
  } catch {
    renderer.forceContextLoss();
    renderer.dispose();
    renderer.domElement.remove();
    delete host.dataset.ready;
    return () => {};
  }
}

function initializeMilkScene(host: HTMLElement, renderer: WebGLRenderer) {
  let disposed = false;
  let frame = 0;
  let visible = true;
  let pointerX = 0;
  let pointerY = 0;
  let scrollProgress = 0;
  let angleX = 0;
  let angleY = 0;
  const hero = host.closest<HTMLElement>(".pastoral-hero") ?? host;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 760px)");
  const textures: Texture[] = [];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact.matches ? 1.25 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, .1, 30);
  camera.position.set(0, 1.6, 7.1);
  camera.lookAt(0, 1.45, 0);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .06, .1, 100);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0x6d7960, 2.8));
  const sunlight = new DirectionalLight(0xfff2d7, 3.4);
  sunlight.position.set(3, 6, 5);
  scene.add(sunlight);
  const fill = new DirectionalLight(0xe4f1f0, 1.6);
  fill.position.set(-4, 2, 1);
  scene.add(fill);

  const assembly = new Group();
  scene.add(assembly);
  const curve = new CatmullRomCurve3([
    new Vector3(.01, .025, 0), new Vector3(.33, .026, 0),
    new Vector3(.43, .08, 0), new Vector3(.455, .2, 0),
    new Vector3(.455, 1.58, 0), new Vector3(.443, 1.78, 0),
    new Vector3(.365, 1.98, 0), new Vector3(.245, 2.24, 0),
    new Vector3(.222, 2.42, 0), new Vector3(.222, 2.72, 0),
  ], false, "centripetal");
  const profile = curve.getPoints(64).map((point) => new Vector2(point.x, point.y));
  const bottleGeometry = new LatheGeometry(profile, 64);
  const milkProfile = profile.slice(0, -5);
  const milkGeometry = new LatheGeometry(milkProfile, 48);
  const milkTop = milkProfile[milkProfile.length - 1];
  const milkMaterial = new MeshPhysicalMaterial({ color: 0xfffcef, roughness: .3, metalness: 0, clearcoat: .45, clearcoatRoughness: .2 });
  // Thin reflective shell avoids the full-screen transmission pass on mobile.
  const glassMaterial = new MeshPhysicalMaterial({ color: 0xf6ffee, transparent: true, opacity: .19, roughness: .075, metalness: .14, clearcoat: 1, clearcoatRoughness: .03, depthWrite: false, envMapIntensity: 1.8 });
  const rimMaterial = new MeshPhysicalMaterial({ color: 0xb6c4aa, transparent: true, opacity: .4, roughness: .12, metalness: .25, depthWrite: false });

  const addBottle = (capColor: number, x: number, y: number, z: number, tilt: number, scale: number) => {
    const bottle = new Group();
    bottle.position.set(x, y, z);
    bottle.rotation.z = tilt;
    bottle.scale.setScalar(scale);
    const milk = new Mesh(milkGeometry, milkMaterial);
    milk.scale.set(.965, .97, .965);
    milk.position.y = .025;
    bottle.add(milk);
    const surface = new Mesh(new CircleGeometry(milkTop.x * .965, 48), milkMaterial);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = milkTop.y * .97 + .025;
    bottle.add(surface);
    bottle.add(new Mesh(bottleGeometry, glassMaterial));
    [2.58, 2.66, .095].forEach((height) => {
      const rim = new Mesh(new TorusGeometry(height < 1 ? .428 : .23, height < 1 ? .024 : .012, 8, 48), rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = height;
      bottle.add(rim);
    });
    const lidMaterial = new MeshStandardMaterial({ color: capColor, roughness: .36, metalness: .5 });
    const cap = new Mesh(new CylinderGeometry(.244, .25, .145, 64, 1), lidMaterial);
    cap.position.y = 2.75;
    bottle.add(cap);
    const capRim = new Mesh(new TorusGeometry(.246, .013, 8, 64), lidMaterial);
    capRim.position.y = 2.697;
    capRim.rotation.x = Math.PI / 2;
    bottle.add(capRim);
    const labelMaterial = new MeshStandardMaterial({ color: 0xfcfbf4, roughness: .85, metalness: 0 });
    const label = new Mesh(new CylinderGeometry(.462, .462, 1.02, 48, 1, true, -.85, 1.7), labelMaterial);
    label.position.y = 1.16;
    bottle.add(label);
    assembly.add(bottle);
    return { bottle, labelMaterial };
  };
  const left = addBottle(0x2c615b, -.46, .1, .2, .125, 1.04);
  const right = addBottle(0xd5d6c9, .52, .075, -.22, -.115, .91);
  right.bottle.rotation.y = -.15;
  left.bottle.rotation.y = .12;

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext("2d");
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(25,43,27,0.3)");
    gradient.addColorStop(.4, "rgba(25,43,27,0.14)");
    gradient.addColorStop(1, "rgba(25,43,27,0)");
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
    const shadowMap = new CanvasTexture(shadowCanvas);
    textures.push(shadowMap);
    const shadow = new Mesh(new PlaneGeometry(2.7, .65), new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
    shadow.rotation.x = -.38;
    shadow.position.set(0, -.04, -.35);
    scene.add(shadow);
  }

  const draw = () => {
    frame = 0;
    if (disposed || !visible || document.hidden || motion.matches) return;
    const targetX = pointerY * .045 + scrollProgress * .07;
    const targetY = pointerX * .18 + scrollProgress * .18;
    angleX += (targetX - angleX) * .085;
    angleY += (targetY - angleY) * .085;
    assembly.rotation.set(angleX, angleY, 0);
    assembly.position.y = scrollProgress * .12;
    renderer.render(scene, camera);
    host.dataset.ready = "true";
    if (Math.abs(targetX - angleX) + Math.abs(targetY - angleY) > .0003) frame = requestAnimationFrame(draw);
  };
  const invalidate = () => { if (!frame && !disposed && visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw); };
  const resize = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.position.z = camera.aspect < .85 ? 7.6 : 7.1;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
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
    if (!visible || motion.matches) return;
    const bounds = hero.getBoundingClientRect();
    scrollProgress = Math.max(0, Math.min(1, -bounds.top / bounds.height));
    const landscape = hero.querySelector<HTMLElement>(".pastoral-landscape");
    if (landscape) landscape.style.transform = `translateY(${scrollProgress * 45}px) scale(1.06)`;
    invalidate();
  };
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else invalidate();
  };
  const onMotion = () => {
    if (motion.matches) {
      cancelAnimationFrame(frame); frame = 0;
      delete host.dataset.ready;
      const landscape = hero.querySelector<HTMLElement>(".pastoral-landscape");
      if (landscape) landscape.style.transform = "";
    } else invalidate();
  };
  const onLost = (event: Event) => { event.preventDefault(); cleanup(); };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { onScroll(); invalidate(); } else { cancelAnimationFrame(frame); frame = 0; }
  });
  observer.observe(host);
  hero.addEventListener("pointermove", onPointer, { passive: true });
  hero.addEventListener("pointerleave", resetPointer);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  const seal = new Image();
  seal.onload = () => {
    if (disposed) return;
    for (const [product, name] of [[left, "KRAVLJE MLEKO"], [right, "KOZJE MLEKO"]] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 768;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = "#fffef9"; context.fillRect(0, 0, 512, 768);
      context.drawImage(seal, 20, 45, 472, 472);
      context.fillStyle = "#263e35"; context.textAlign = "center";
      context.font = "500 30px Arial, sans-serif"; context.fillText(name, 256, 582);
      context.font = "24px Arial, sans-serif"; context.fillText("SA DOMAĆIH FARMI", 256, 628);
      context.font = "28px Georgia, serif"; context.fillText("1 L", 256, 699);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
      product.labelMaterial.color = new Color(0xffffff);
      product.labelMaterial.map = texture;
      product.labelMaterial.needsUpdate = true;
    }
    invalidate();
  };
  seal.src = "/images/mleko-i-mleko-seal.webp";
  resize();

  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect(); observer.disconnect();
    hero.removeEventListener("pointermove", onPointer);
    hero.removeEventListener("pointerleave", resetPointer);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    motion.removeEventListener("change", onMotion);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    seal.onload = null;
    const geometries = new Set<import("three").BufferGeometry>();
    const materials = new Set<import("three").Material>();
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    delete host.dataset.ready;
    const landscape = hero.querySelector<HTMLElement>(".pastoral-landscape");
    if (landscape) landscape.style.transform = "";
  }
  return cleanup;
}
