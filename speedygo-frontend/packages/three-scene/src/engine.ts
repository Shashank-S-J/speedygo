/**
 * SpeedyGo 3D Logistics Scene Engine
 * Creates adaptive Three.js scenes with logistics-themed 3D objects
 */
import * as THREE from 'three';
import { THEMES, ThemeName, detectDevice, getPixelRatio, getQualityScale } from './index';

// ─── Types ───
export type SceneType =
  | 'login'          // delivery truck hero + floating packages
  | 'dashboard'      // globe with routes
  | 'tracking'       // road with moving vehicle
  | 'booking'        // package assembly
  | 'chat'           // speech bubbles
  | 'payment'        // coins + card
  | 'sos'            // pulsing alert
  | 'kyc'            // document stack
  | 'vehicles'       // vehicle showcase
  | 'earnings'       // chart bars 3D
  | 'admin-overview' // city grid
  | 'jobs'           // map pins
  | 'profile'        // avatar ring
  | 'ambient';       // floating particles only

export interface SceneConfig {
  type: SceneType;
  theme: ThemeName;
  interactive?: boolean;   // respond to mouse / touch
  intensity?: number;      // 0-1, controls object count / effects
  overlay?: boolean;       // darken for readability
}

// ─── Geometry Builders ───
function createDeliveryTruck(color: number): THREE.Group {
  const g = new THREE.Group();
  // cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 }),
  );
  cabin.position.set(-0.35, 0.35, 0);
  cabin.castShadow = true;
  g.add(cabin);
  // cargo box
  const cargo = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.6, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.6 }),
  );
  cargo.position.set(0.35, 0.4, 0);
  cargo.castShadow = true;
  g.add(cargo);
  // stripe on cargo
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.01, 0.08, 0.56),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.3 }),
  );
  stripe.position.set(0.35, 0.55, 0);
  g.add(stripe);
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3 });
  const makeWheel = (x: number, z: number) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.1, z);
    w.castShadow = true;
    return w;
  };
  g.add(makeWheel(-0.35, 0.3), makeWheel(-0.35, -0.3), makeWheel(0.5, 0.3), makeWheel(0.5, -0.3));
  // headlights
  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff3cd, emissive: 0xfff3cd, emissiveIntensity: 0.8 }),
  );
  headlight.position.set(-0.65, 0.3, 0.15);
  const hl2 = headlight.clone();
  hl2.position.z = -0.15;
  g.add(headlight, hl2);
  return g;
}

function createPackageBox(color: number, size = 0.3): THREE.Mesh {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    metalness: 0.05,
    roughness: 0.8,
  });
  const box = new THREE.Mesh(geo, mat);
  // tape stripe
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.02, size * 0.08, size * 1.02),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.3 }),
  );
  tape.position.y = size * 0.2;
  box.add(tape);
  const tape2 = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.08, size * 1.02, size * 1.02),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.3 }),
  );
  box.add(tape2);
  box.castShadow = true;
  return box;
}

function createMapPin(color: number, height = 0.6): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, height * 0.6, 16),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.3 }),
  );
  body.position.y = height * 0.15;
  body.rotation.x = Math.PI;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 16),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.3 }),
  );
  head.position.y = height * 0.55;
  head.castShadow = true;
  g.add(head);
  // inner dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }),
  );
  dot.position.y = height * 0.55;
  g.add(dot);
  return g;
}

function createGlobe(color: number): THREE.Group {
  const g = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x1a2744,
      metalness: 0.2,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85,
    }),
  );
  g.add(sphere);
  // latitude lines
  for (let i = -2; i <= 2; i++) {
    const r = Math.cos((i / 3) * Math.PI / 2);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.005, 8, 64),
      new THREE.MeshBasicMaterial({ color }),
    );
    ring.position.y = Math.sin((i / 3) * Math.PI / 2);
    g.add(ring);
  }
  // meridian
  const meridian = new THREE.Mesh(
    new THREE.TorusGeometry(1.001, 0.005, 8, 64),
    new THREE.MeshBasicMaterial({ color }),
  );
  meridian.rotation.y = Math.PI / 2;
  g.add(meridian);
  const m2 = meridian.clone();
  m2.rotation.z = Math.PI / 3;
  g.add(m2);
  // route arcs
  for (let i = 0; i < 4; i++) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(i * 1.5) * 1.01, Math.sin(i * 0.5) * 0.5, Math.sin(i * 1.5) * 1.01),
      new THREE.Vector3(Math.cos(i * 1.5 + 0.5) * 1.5, 0.8, Math.sin(i * 1.5 + 0.5) * 1.5),
      new THREE.Vector3(Math.cos(i * 1.5 + 1) * 1.01, Math.sin(i * 0.3) * 0.3, Math.sin(i * 1.5 + 1) * 1.01),
    );
    const pts = curve.getPoints(30);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    );
    g.add(line);
  }
  return g;
}

function createRoad(): THREE.Group {
  const g = new THREE.Group();
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.9 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  road.receiveShadow = true;
  g.add(road);
  // dashes
  for (let i = -5; i <= 5; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 1.0, 0.02, 0);
    g.add(dash);
  }
  return g;
}

function createCoin(color: number): THREE.Mesh {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.2 }),
  );
  // edge ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.015, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.15 }),
  );
  ring.rotation.x = Math.PI / 2;
  coin.add(ring);
  coin.castShadow = true;
  return coin;
}

function createDocumentStack(color: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const doc = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.03, 0.65),
      new THREE.MeshStandardMaterial({
        color: i === 0 ? color : 0xf5f5f0,
        metalness: 0.05,
        roughness: 0.9,
      }),
    );
    doc.position.y = i * 0.04;
    doc.rotation.y = (i * 0.05) - 0.05;
    doc.castShadow = true;
    g.add(doc);
  }
  // stamp
  const stamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, metalness: 0.3 }),
  );
  stamp.position.set(0.12, 0.17, 0.15);
  g.add(stamp);
  return g;
}

function createSpeechBubble(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.5 }),
  );
  body.scale.set(1.2, 0.9, 0.5);
  body.castShadow = true;
  g.add(body);
  // tail
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.15, 8),
    new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.5 }),
  );
  tail.position.set(-0.2, -0.25, 0);
  tail.rotation.z = 0.5;
  g.add(tail);
  // dots
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }),
    );
    dot.position.set(-0.1 + i * 0.1, 0, 0.16);
    g.add(dot);
  }
  return g;
}

function createAlertPulse(color: number): THREE.Group {
  const g = new THREE.Group();
  // triangle
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.4);
  shape.lineTo(-0.35, -0.2);
  shape.lineTo(0.35, -0.2);
  shape.closePath();
  const triGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
  const tri = new THREE.Mesh(
    triGeo,
    new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.2, roughness: 0.3, emissive: 0xef4444, emissiveIntensity: 0.3 }),
  );
  tri.castShadow = true;
  g.add(tri);
  // excl mark
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.18, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }),
  );
  bar.position.set(0, 0.12, 0.06);
  g.add(bar);
  const dotE = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }),
  );
  dotE.position.set(0, -0.02, 0.06);
  g.add(dotE);
  return g;
}

function createChartBars(color: number): THREE.Group {
  const g = new THREE.Group();
  const heights = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 1.0];
  const barWidth = 0.12;
  const gap = 0.06;
  const total = heights.length * (barWidth + gap);
  heights.forEach((h, i) => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(barWidth, h, barWidth),
      new THREE.MeshStandardMaterial({
        color: i === heights.length - 1 ? color : 0x334155,
        metalness: 0.2,
        roughness: 0.4,
      }),
    );
    bar.position.set(i * (barWidth + gap) - total / 2, h / 2, 0);
    bar.castShadow = true;
    g.add(bar);
  });
  return g;
}

function createCityGrid(color: number): THREE.Group {
  const g = new THREE.Group();
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if (Math.random() > 0.5) continue;
      const h = 0.2 + Math.random() * 0.8;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 + Math.random() * 0.2, h, 0.3 + Math.random() * 0.2),
        new THREE.MeshStandardMaterial({
          color: Math.random() > 0.8 ? color : 0x1e293b,
          metalness: 0.3,
          roughness: 0.5,
        }),
      );
      building.position.set(x * 0.7, h / 2, z * 0.7);
      building.castShadow = true;
      g.add(building);
    }
  }
  return g;
}

function createAvatarRing(color: number): THREE.Group {
  const g = new THREE.Group();
  // ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.04, 16, 48),
    new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.2 }),
  );
  g.add(ring);
  // avatar sphere
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.1, roughness: 0.6 }),
  );
  head.position.y = 0.1;
  g.add(head);
  // body
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.1, roughness: 0.6 }),
  );
  body.scale.set(1.2, 0.8, 0.8);
  body.position.y = -0.25;
  g.add(body);
  return g;
}

// ─── Floating Particle System ───
function createParticles(count: number, spread: number, color: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = Math.random() * spread * 0.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    sizes[i] = Math.random() * 3 + 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.04,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

// ─── Main Engine ───
export class LogisticsSceneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private animationId: number | null = null;
  private clock = new THREE.Clock();
  private objects: THREE.Object3D[] = [];
  private particles: THREE.Points | null = null;
  private config: SceneConfig;
  private cameraState = {
    theta: 0, phi: Math.PI / 4.5, distance: 6,
    targetTheta: 0, targetPhi: Math.PI / 4.5, targetDist: 6,
  };
  private mouseState = { isDown: false, lastX: 0, lastY: 0, mx: 0, my: 0 };
  private touchState = { lastDist: 0 };
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, config: SceneConfig) {
    this.config = config;
    const theme = THEMES[config.theme];
    const device = detectDevice();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: device !== 'mobile',
      alpha: true,
      powerPreference: device === 'mobile' ? 'low-power' : 'high-performance',
    });
    this.renderer.shadowMap.enabled = device !== 'mobile';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(theme.bg, config.overlay ? 0.92 : 1);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(theme.fog, 0.04);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

    // Lights
    this.scene.add(new THREE.AmbientLight(theme.ambient, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(device === 'mobile' ? 512 : 1024, device === 'mobile' ? 512 : 1024);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 25;
    dir.shadow.camera.left = -8; dir.shadow.camera.right = 8;
    dir.shadow.camera.top = 8; dir.shadow.camera.bottom = -8;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(theme.accent, 0.25);
    fill.position.set(-4, 3, -5);
    this.scene.add(fill);

    const rim = new THREE.PointLight(theme.secondary, 0.4, 18);
    rim.position.set(0, 4, -7);
    this.scene.add(rim);

    // Ground plane (shadow receiver)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(16, 16, theme.ground, theme.ground);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);

    // Build scene-specific objects
    this.buildScene(config.type, theme);

    // Particles
    const pCount = device === 'mobile' ? 40 : device === 'tablet' ? 80 : 150;
    this.particles = createParticles(pCount, 12, theme.particles);
    this.scene.add(this.particles);

    // Interaction listeners
    if (config.interactive !== false) {
      this.bindEvents();
    }

    this.resize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.resize);
    }
  }

  private buildScene(type: SceneType, theme: { accent: number; accentHex: string; secondary: number; bg: number; fog: number; ambient: number; ground: number; particles: number }) {
    const color = theme.accent;
    switch (type) {
      case 'login': {
        const truck = createDeliveryTruck(color);
        truck.scale.setScalar(1.6);
        truck.position.set(-1, 0.1, 0);
        this.scene.add(truck);
        this.objects.push(truck);
        for (let i = 0; i < 5; i++) {
          const pkg = createPackageBox(color, 0.2 + Math.random() * 0.15);
          pkg.position.set(1.5 + Math.random() * 2, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3);
          pkg.rotation.set(Math.random(), Math.random(), Math.random());
          this.scene.add(pkg);
          this.objects.push(pkg);
        }
        const pin = createMapPin(color);
        pin.position.set(2.5, 0, -1.5);
        this.scene.add(pin);
        this.objects.push(pin);
        this.cameraState.targetDist = 5;
        this.cameraState.distance = 5;
        break;
      }
      case 'dashboard': {
        const globe = createGlobe(color);
        globe.scale.setScalar(1.3);
        globe.position.y = 1.2;
        this.scene.add(globe);
        this.objects.push(globe);
        for (let i = 0; i < 3; i++) {
          const pin = createMapPin(color);
          const a = (i / 3) * Math.PI * 2;
          pin.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
          this.scene.add(pin);
          this.objects.push(pin);
        }
        this.cameraState.targetDist = 6;
        this.cameraState.distance = 6;
        break;
      }
      case 'tracking': {
        const road = createRoad();
        this.scene.add(road);
        this.objects.push(road);
        const truck = createDeliveryTruck(color);
        truck.scale.setScalar(1.2);
        truck.position.set(0, 0.05, 0);
        truck.rotation.y = Math.PI / 2;
        this.scene.add(truck);
        this.objects.push(truck);
        const pinA = createMapPin(0x22c55e);
        pinA.position.set(-4, 0, -1.5);
        this.scene.add(pinA);
        this.objects.push(pinA);
        const pinB = createMapPin(0xef4444);
        pinB.position.set(4, 0, -1.5);
        this.scene.add(pinB);
        this.objects.push(pinB);
        this.cameraState.targetPhi = Math.PI / 5;
        this.cameraState.phi = Math.PI / 5;
        break;
      }
      case 'booking': {
        for (let i = 0; i < 7; i++) {
          const pkg = createPackageBox(color, 0.25 + Math.random() * 0.2);
          const a = (i / 7) * Math.PI * 2;
          pkg.position.set(Math.cos(a) * 2, 0.15, Math.sin(a) * 2);
          this.scene.add(pkg);
          this.objects.push(pkg);
        }
        this.cameraState.targetDist = 5;
        this.cameraState.distance = 5;
        break;
      }
      case 'chat': {
        for (let i = 0; i < 4; i++) {
          const bubble = createSpeechBubble(i % 2 === 0 ? color : 0x475569);
          bubble.position.set((Math.random() - 0.5) * 4, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
          bubble.rotation.y = Math.random() * Math.PI;
          this.scene.add(bubble);
          this.objects.push(bubble);
        }
        break;
      }
      case 'payment': {
        for (let i = 0; i < 8; i++) {
          const coin = createCoin(color);
          coin.position.set((Math.random() - 0.5) * 4, 0.3 + Math.random() * 2.5, (Math.random() - 0.5) * 3);
          coin.rotation.x = Math.random() * Math.PI;
          coin.rotation.z = Math.random() * 0.3;
          this.scene.add(coin);
          this.objects.push(coin);
        }
        break;
      }
      case 'sos': {
        const alert = createAlertPulse(color);
        alert.scale.setScalar(2);
        alert.position.y = 1;
        this.scene.add(alert);
        this.objects.push(alert);
        break;
      }
      case 'kyc': {
        const docs = createDocumentStack(color);
        docs.scale.setScalar(2.5);
        docs.position.y = 0.5;
        this.scene.add(docs);
        this.objects.push(docs);
        break;
      }
      case 'vehicles': {
        for (let i = 0; i < 3; i++) {
          const truck = createDeliveryTruck(color);
          truck.scale.setScalar(1.0 + i * 0.15);
          const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
          truck.position.set(Math.cos(a) * 2.5, 0.05, Math.sin(a) * 2.5);
          truck.rotation.y = -a + Math.PI / 2;
          this.scene.add(truck);
          this.objects.push(truck);
        }
        break;
      }
      case 'earnings': {
        const chart = createChartBars(color);
        chart.scale.setScalar(2.5);
        chart.position.y = 0;
        this.scene.add(chart);
        this.objects.push(chart);
        this.cameraState.targetPhi = Math.PI / 5;
        this.cameraState.phi = Math.PI / 5;
        break;
      }
      case 'admin-overview': {
        const city = createCityGrid(color);
        this.scene.add(city);
        this.objects.push(city);
        this.cameraState.targetDist = 7;
        this.cameraState.distance = 7;
        this.cameraState.targetPhi = Math.PI / 5;
        this.cameraState.phi = Math.PI / 5;
        break;
      }
      case 'jobs': {
        for (let i = 0; i < 6; i++) {
          const pin = createMapPin(i < 2 ? 0x22c55e : color);
          pin.position.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
          this.scene.add(pin);
          this.objects.push(pin);
        }
        break;
      }
      case 'profile': {
        const avatar = createAvatarRing(color);
        avatar.scale.setScalar(2);
        avatar.position.y = 1.2;
        this.scene.add(avatar);
        this.objects.push(avatar);
        break;
      }
      case 'ambient':
      default:
        break;
    }
  }

  // ─── Event Binding ───
  private bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', this.onMouseDown);
    c.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('touchstart', this.onTouchStart, { passive: false });
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
    c.addEventListener('touchend', this.onTouchEnd);
  }

  private onMouseDown = (e: MouseEvent) => {
    this.mouseState.isDown = true;
    this.mouseState.lastX = e.clientX;
    this.mouseState.lastY = e.clientY;
  };
  private onMouseUp = () => { this.mouseState.isDown = false; };
  private onMouseMove = (e: MouseEvent) => {
    // Parallax effect (subtle reaction to cursor)
    this.mouseState.mx = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouseState.my = (e.clientY / window.innerHeight - 0.5) * 2;
    if (this.mouseState.isDown) {
      const dx = e.clientX - this.mouseState.lastX;
      const dy = e.clientY - this.mouseState.lastY;
      this.cameraState.targetTheta -= dx * 0.004;
      this.cameraState.targetPhi += dy * 0.004;
      this.mouseState.lastX = e.clientX;
      this.mouseState.lastY = e.clientY;
    }
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cameraState.targetDist += e.deltaY * 0.004;
  };
  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.mouseState.isDown = true;
      this.mouseState.lastX = e.touches[0]!.clientX;
      this.mouseState.lastY = e.touches[0]!.clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[1]!.clientX - e.touches[0]!.clientX;
      const dy = e.touches[1]!.clientY - e.touches[0]!.clientY;
      this.touchState.lastDist = Math.sqrt(dx * dx + dy * dy);
    }
  };
  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && this.mouseState.isDown) {
      const dx = e.touches[0]!.clientX - this.mouseState.lastX;
      const dy = e.touches[0]!.clientY - this.mouseState.lastY;
      this.cameraState.targetTheta -= dx * 0.006;
      this.cameraState.targetPhi += dy * 0.006;
      this.mouseState.lastX = e.touches[0]!.clientX;
      this.mouseState.lastY = e.touches[0]!.clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[1]!.clientX - e.touches[0]!.clientX;
      const dy = e.touches[1]!.clientY - e.touches[0]!.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (this.touchState.lastDist > 0) {
        this.cameraState.targetDist *= this.touchState.lastDist / dist;
      }
      this.touchState.lastDist = dist;
    }
  };
  private onTouchEnd = (e: TouchEvent) => {
    this.mouseState.isDown = false;
    if (e.touches.length < 2) this.touchState.lastDist = 0;
  };

  // ─── Resize ───
  resize = () => {
    if (this.disposed) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const device = detectDevice();
    const dpr = getPixelRatio(device);
    const quality = getQualityScale(device);
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(dpr * quality);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ─── Animation ───
  start() {
    if (this.animationId !== null) return;
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(loop);
      this.update();
    };
    loop();
  }

  private update() {
    const t = this.clock.getElapsedTime();

    // Auto-rotate camera
    if (!this.mouseState.isDown) {
      this.cameraState.targetTheta += 0.002;
    }
    // clamp
    this.cameraState.targetPhi = Math.max(0.15, Math.min(Math.PI / 2.2, this.cameraState.targetPhi));
    this.cameraState.targetDist = Math.max(2.5, Math.min(18, this.cameraState.targetDist));
    // damping
    const d = 0.04;
    this.cameraState.theta += (this.cameraState.targetTheta - this.cameraState.theta) * d;
    this.cameraState.phi += (this.cameraState.targetPhi - this.cameraState.phi) * d;
    this.cameraState.distance += (this.cameraState.targetDist - this.cameraState.distance) * d;

    const dist = this.cameraState.distance;
    const phi = this.cameraState.phi;
    const theta = this.cameraState.theta;
    // subtle parallax offset
    const px = this.mouseState.mx * 0.3;
    const py = this.mouseState.my * 0.3;
    this.camera.position.set(
      dist * Math.sin(phi) * Math.sin(theta) + px,
      dist * Math.cos(phi) + py,
      dist * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(0, 0.6, 0);

    // Animate objects per scene type
    this.animateObjects(t);

    // Animate particles
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setY(i, y + Math.sin(t * 0.3 + i) * 0.0008);
        const x = pos.getX(i);
        pos.setX(i, x + Math.cos(t * 0.2 + i * 0.7) * 0.0004);
      }
      pos.needsUpdate = true;
      this.particles.rotation.y = t * 0.01;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private animateObjects(t: number) {
    const type = this.config.type;
    this.objects.forEach((obj, i) => {
      switch (type) {
        case 'login':
          if (i === 0) {
            // truck subtle bob
            obj.position.y = 0.1 + Math.sin(t * 0.6) * 0.03;
            obj.rotation.y = Math.sin(t * 0.3) * 0.05;
          } else {
            // floating packages
            obj.position.y = (obj.userData as { baseY?: number }).baseY ?? (0.5 + i * 0.4) + Math.sin(t * 0.7 + i * 1.2) * 0.2;
            obj.rotation.x = t * 0.3 + i;
            obj.rotation.z = t * 0.2 + i * 0.5;
            if (!(obj.userData as { baseY?: number }).baseY) {
              (obj.userData as { baseY: number }).baseY = obj.position.y;
            }
          }
          break;
        case 'dashboard':
          if (i === 0) {
            obj.rotation.y = t * 0.15; // globe spin
          } else {
            obj.position.y = Math.sin(t * 0.8 + i * 1.5) * 0.1;
          }
          break;
        case 'tracking':
          if (i === 1) {
            // truck moves along road
            obj.position.x = Math.sin(t * 0.4) * 3.5;
            obj.position.y = 0.05 + Math.abs(Math.sin(t * 2)) * 0.015; // road bumps
          }
          break;
        case 'booking':
          obj.position.y = 0.15 + Math.sin(t * 0.5 + i * 0.9) * 0.25;
          obj.rotation.y = t * 0.2 + i;
          break;
        case 'chat':
          obj.position.y += Math.sin(t * 0.5 + i * 1.3) * 0.002;
          obj.rotation.z = Math.sin(t * 0.3 + i) * 0.1;
          break;
        case 'payment':
          obj.position.y += Math.sin(t * 0.6 + i * 0.8) * 0.002;
          obj.rotation.y = t * 0.5 + i;
          obj.rotation.x += Math.sin(t * 0.3 + i) * 0.002;
          break;
        case 'sos':
          obj.scale.setScalar(2 + Math.sin(t * 3) * 0.15);
          obj.rotation.z = Math.sin(t * 1.5) * 0.08;
          break;
        case 'kyc':
          obj.rotation.y = Math.sin(t * 0.4) * 0.15;
          obj.position.y = 0.5 + Math.sin(t * 0.5) * 0.08;
          break;
        case 'vehicles':
          obj.position.y = 0.05 + Math.sin(t * 0.4 + i * 2) * 0.03;
          break;
        case 'earnings':
          // bars grow subtly
          obj.children?.forEach((bar: THREE.Object3D, j: number) => {
            bar.scale.y = 0.9 + Math.sin(t * 0.8 + j * 0.5) * 0.1;
          });
          obj.rotation.y = t * 0.05;
          break;
        case 'admin-overview':
          obj.rotation.y = t * 0.02;
          break;
        case 'jobs':
          obj.position.y = Math.sin(t * 0.6 + i * 1.1) * 0.08;
          break;
        case 'profile':
          obj.rotation.y = t * 0.3;
          obj.rotation.z = Math.sin(t * 0.5) * 0.1;
          break;
      }
    });
  }

  // ─── Cleanup ───
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}

