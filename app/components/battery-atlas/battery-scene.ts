import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FeatureCollection, Position } from "geojson";
import indiaRaw from "../../data/india-states-simplified.geojson?raw";
import type { BatteryResearchRecord } from "../../domain/battery-research";

const geography = JSON.parse(indiaRaw) as FeatureCollection;
const coordinate = ([longitude, latitude]: Position) => new THREE.Vector2((longitude - 82) * .91, latitude - 23);

function polygonShape(rings: Position[][]) {
  const shape = new THREE.Shape(rings[0].map(coordinate));
  for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(coordinate)));
  return shape;
}

export async function createBatteryScene(
  host: HTMLElement,
  records: readonly BatteryResearchRecord[],
  onPoints: (points: { id: string; x: number; y: number }[]) => void,
) {
  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
  // Failed init has no scene resources; dispose() would retry init in Three r185.
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  host.appendChild(renderer.domElement);
  host.dataset.backend = ("isWebGPUBackend" in renderer.backend && renderer.backend.isWebGPUBackend) ? "webgpu" : "webgl2";
  renderer.domElement.setAttribute("aria-label", "Orbit India with arrow keys; use the zoom and reset buttons");
  renderer.domElement.tabIndex = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
  const home = new THREE.Vector3(0, -24, 49);
  camera.position.copy(home);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.enablePan = true;
  orbit.minDistance = 18;
  orbit.maxDistance = 85;
  orbit.minPolarAngle = 1.1;
  orbit.maxPolarAngle = 2.2;
  orbit.minAzimuthAngle = -.7;
  orbit.maxAzimuthAngle = .7;
  orbit.target.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  orbit.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526c91, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(-15, 20, 35);
  scene.add(light);
  const land = new THREE.Group();
  scene.add(land);
  const material = new THREE.MeshStandardMaterial({ color: 0xa7c2d9, roughness: .75, metalness: .08 });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xf0f6fc, transparent: true, opacity: .8 });
  for (const feature of geography.features) {
    const geometry = feature.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      const meshGeometry = new THREE.ExtrudeGeometry(polygonShape(polygon), { depth: .3, bevelEnabled: false });
      land.add(new THREE.Mesh(meshGeometry, material));
      const outline = new THREE.BufferGeometry().setFromPoints(polygon[0].map((p) => { const v = coordinate(p); return new THREE.Vector3(v.x, v.y, .32); }));
      land.add(new THREE.Line(outline, edgeMaterial));
    }
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const start = performance.now();
  let width = 1, height = 1, disposed = false;
  function projectPoints() {
    camera.updateMatrixWorld();
    onPoints(records.flatMap((record) => {
      if (!record.location) return [];
      const p = coordinate([record.location.longitude, record.location.latitude]);
      const v = new THREE.Vector3(p.x, p.y, .5).project(camera);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) return [];
      return [{ id: record.id, x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 }];
    }));
  }
  function draw() { if (disposed || document.hidden) return; renderer.render(scene, camera); projectPoints(); }
  function resize() {
    width = host.clientWidth; height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  orbit.addEventListener("change", draw);
  const onKey = (event: KeyboardEvent) => {
    const shifts: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!shifts[event.key]) return;
    event.preventDefault();
    const [x, y] = shifts[event.key];
    const offset = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    offset.theta = THREE.MathUtils.clamp(offset.theta + x * .08, -.7, .7);
    offset.phi = THREE.MathUtils.clamp(offset.phi - y * .08, 1.1, 2.2);
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(offset));
    orbit.update(); draw();
  };
  renderer.domElement.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", draw);
  // A short arrival animation keeps the settled map still for reading and selection.
  renderer.setAnimationLoop(() => {
    const progress = reducedMotion.matches ? 1 : Math.min(1, (performance.now() - start) / 1000);
    land.scale.z = .1 + .9 * progress;
    draw();
    if (progress === 1) renderer.setAnimationLoop(null);
  });
  resize();
  return {
    zoom(factor: number) { const offset = camera.position.clone().sub(orbit.target); offset.setLength(THREE.MathUtils.clamp(offset.length() / factor, 18, 85)); camera.position.copy(orbit.target).add(offset); orbit.update(); draw(); },
    reset() { camera.position.copy(home); orbit.target.set(0, 0, 0); orbit.update(); draw(); },
    dispose() {
      disposed = true; observer.disconnect(); orbit.dispose(); renderer.setAnimationLoop(null);
      document.removeEventListener("visibilitychange", draw);
      renderer.domElement.removeEventListener("keydown", onKey);
      land.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose(); });
      material.dispose(); edgeMaterial.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
