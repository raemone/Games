/**
 * The table in three dimensions.
 *
 * Every solid in here is built from the same `table.ts` geometry the physics
 * collides against, so a wall on screen is the wall the ball hits. Nothing is
 * modelled twice and nothing can drift: move a bumper and it moves in both
 * places, which was the whole reason for keeping the geometry as data.
 *
 * Table coordinates are 0..380 across and 0..680 down, with height above the
 * wood as a third axis. World coordinates are three.js's: x across, y up, z
 * towards the viewer. `place()` is the only thing that knows the difference.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { Session } from '../game/session';
import { PALETTE } from '../game/theme';
import { LANE_LETTERS } from '../game/scoring';
import {
  ART_SCALE,
  LANE_INSERT,
  MISSION_LAMPS,
  ORBIT_ARROWS,
  drawPlayfieldArt,
} from '../game/playfield-art';
import {
  BUMPERS,
  DOGHOUSE,
  DROP_TARGETS,
  FLIPPER_LENGTH,
  PLUNGER_REST,
  SQUIRREL,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  TOP_LANES,
  staticColliders,
} from '../game/table';
import type { Wall } from '../game/physics';

/** The angle a real playfield sits at, and the one the physics assumes. */
const INCLINE = (6.5 * Math.PI) / 180;

/** Heights in table units, so they read against the geometry's own numbers. */
const WALL_HEIGHT = 26;
const WALL_THICKNESS = 4;
const RAIL_HEIGHT = 3.5;

/** How far above the wood the lamps and the target faces sit. */
const LAMP_LIFT = 0.6;

/** Where the camera sits: how far round from overhead, and how much it sees. */
const CAMERA_PITCH = (54 * Math.PI) / 180;
const CAMERA_FOV = 40;
/**
 * The table is seen at an angle, so it takes up less of the frame than its
 * length alone would suggest. This is the fudge for that, tuned by looking.
 */
const FORESHORTENING = 0.82;

const scratch = new Object3D();

/** Table coordinates, plus a height, into world space. */
function place(target: Object3D, x: number, y: number, height = 0): void {
  target.position.set(x - TABLE_WIDTH / 2, height, y - TABLE_HEIGHT / 2);
}

export class TableScene {
  readonly renderer: WebGLRenderer;

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 20, 4000);
  /** Everything that is part of the table, tilted together like a real one. */
  private readonly table = new Group();

  private readonly balls: Mesh[] = [];
  private readonly ballSpin: Quaternion[] = [];
  private readonly flippers: Mesh[] = [];
  private readonly drops: Mesh[] = [];
  private readonly laneLamps: Mesh[] = [];
  private readonly missionLamps: Mesh[] = [];
  private readonly orbitLamps: Mesh[] = [];
  private readonly bumperCaps: Mesh[] = [];
  private readonly bumperLights: PointLight[] = [];
  private doghouseLamp!: Mesh;
  private plunger!: Mesh;
  private squirrelTarget!: Mesh;

  private ballGeometry!: SphereGeometry;
  private ballMaterial!: MeshStandardMaterial;

  private lastFrame = 0;
  private slowFrames = 0;
  private downgraded = false;
  private wantedPixelRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.scene.background = new Color(PALETTE.space);
    this.table.rotation.x = INCLINE;
    this.scene.add(this.table);

    // A chrome ball with nothing to reflect looks like a grey circle, so the
    // scene gets a cheap generated room to bounce off it.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.buildLights();
    this.buildPlayfield();
    this.buildWalls();
    this.buildBumpers();
    this.buildTargets();
    this.buildDoghouse();
    this.buildFlippers();
    this.buildLamps();
    this.buildPlunger();
    this.buildBallPrototype();
  }

  // ------------------------------------------------------------------ build

  private buildLights(): void {
    this.scene.add(new HemisphereLight(0x8f7bc0, 0x140b24, 0.42));

    // One shadow-casting key light. The ball's shadow on the wood is the single
    // thing that stops a rendered table looking like a diagram, so the frustum
    // is wrapped tightly round the playfield to spend the whole map on it.
    const key = new DirectionalLight(0xfff0d8, 1.6);
    key.position.set(-160, 620, 260);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -260;
    key.shadow.camera.right = 260;
    key.shadow.camera.top = 420;
    key.shadow.camera.bottom = -420;
    key.shadow.camera.near = 100;
    key.shadow.camera.far = 1400;
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new DirectionalLight(0x9ec8ff, 0.38);
    fill.position.set(240, 340, -300);
    this.scene.add(fill);
  }

  private buildPlayfield(): void {
    const canvas = document.createElement('canvas');
    canvas.width = TABLE_WIDTH * ART_SCALE;
    canvas.height = TABLE_HEIGHT * ART_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available in this browser');
    drawPlayfieldArt(ctx);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const wood = new Mesh(
      new PlaneGeometry(TABLE_WIDTH, TABLE_HEIGHT),
      new MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.05 }),
    );
    wood.rotation.x = -Math.PI / 2;
    wood.receiveShadow = true;
    this.table.add(wood);
  }

  /**
   * Every wall the ball can hit, as one instanced box plus one instanced rail.
   * Reading them out of `staticColliders()` rather than listing them again is
   * what guarantees the picture matches the collision.
   */
  private buildWalls(): void {
    const segments = staticColliders().filter(
      (collider): collider is Wall =>
        collider.kind === 'wall' &&
        // The launch gate is a rule, not a rail: drawing it would put a fence
        // across the mouth of the channel that the ball visibly goes through.
        collider.blockNormal === undefined &&
        // Target faces are their own models, further down.
        !collider.id?.startsWith('drop-') &&
        collider.id !== 'squirrel',
    );

    const body = new InstancedMesh(
      new BoxGeometry(1, WALL_HEIGHT, WALL_THICKNESS),
      new MeshStandardMaterial({ color: 0x241640, roughness: 0.75, metalness: 0.1 }),
      segments.length,
    );
    const rail = new InstancedMesh(
      new BoxGeometry(1, RAIL_HEIGHT, WALL_THICKNESS + 1.6),
      new MeshStandardMaterial({ color: 0xd9c9ff, roughness: 0.22, metalness: 0.95 }),
      segments.length,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    rail.castShadow = true;

    segments.forEach((wall, index) => {
      const dx = wall.b.x - wall.a.x;
      const dy = wall.b.y - wall.a.y;
      const length = Math.hypot(dx, dy);
      const midX = (wall.a.x + wall.b.x) / 2;
      const midY = (wall.a.y + wall.b.y) / 2;
      // Table y runs down the screen and world z runs towards the viewer, so a
      // table-space heading becomes a rotation about the world's up axis.
      const heading = -Math.atan2(dy, dx);

      place(scratch, midX, midY, WALL_HEIGHT / 2);
      scratch.rotation.set(0, heading, 0);
      scratch.scale.set(length, 1, 1);
      scratch.updateMatrix();
      body.setMatrixAt(index, scratch.matrix);

      place(scratch, midX, midY, WALL_HEIGHT + RAIL_HEIGHT / 2);
      scratch.rotation.set(0, heading, 0);
      scratch.scale.set(length, 1, 1);
      scratch.updateMatrix();
      rail.setMatrixAt(index, scratch.matrix);
    });

    this.table.add(body, rail);

    const posts = staticColliders().filter((collider) => collider.kind === 'post');
    const postMesh = new InstancedMesh(
      new CylinderGeometry(1, 1, WALL_HEIGHT, 14),
      new MeshStandardMaterial({ color: 0xf0e6ff, roughness: 0.3, metalness: 0.6 }),
      posts.length,
    );
    postMesh.castShadow = true;
    posts.forEach((post, index) => {
      if (post.kind !== 'post') return;
      place(scratch, post.center.x, post.center.y, WALL_HEIGHT / 2);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(post.radius, 1, post.radius);
      scratch.updateMatrix();
      postMesh.setMatrixAt(index, scratch.matrix);
    });
    this.table.add(postMesh);
  }

  private buildBumpers(): void {
    for (const bumper of BUMPERS) {
      const skirt = new Mesh(
        new CylinderGeometry(bumper.radius, bumper.radius + 2, 8, 24),
        new MeshStandardMaterial({ color: 0x2a1a4a, roughness: 0.7 }),
      );
      place(skirt, bumper.center.x, bumper.center.y, 4);
      skirt.castShadow = true;
      skirt.receiveShadow = true;
      this.table.add(skirt);

      const cap = new Mesh(
        new CylinderGeometry(bumper.radius * 0.72, bumper.radius, 14, 24),
        new MeshStandardMaterial({
          color: 0xffb733,
          emissive: new Color(0xff9d1f),
          emissiveIntensity: 0.45,
          roughness: 0.42,
          metalness: 0.1,
        }),
      );
      place(cap, bumper.center.x, bumper.center.y, 15);
      cap.castShadow = true;
      this.table.add(cap);
      this.bumperCaps.push(cap);

      const light = new PointLight(new Color(PALETTE.gold), 0, 130, 2);
      place(light, bumper.center.x, bumper.center.y, 26);
      this.table.add(light);
      this.bumperLights.push(light);
    }
  }

  private buildTargets(): void {
    const face = new MeshStandardMaterial({
      color: PALETTE.sky,
      emissive: new Color(PALETTE.sky),
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    for (const spec of DROP_TARGETS) {
      const height = spec.b.y - spec.a.y;
      const target = new Mesh(new BoxGeometry(3.5, 18, height), face.clone());
      place(target, spec.a.x, (spec.a.y + spec.b.y) / 2, 9);
      target.castShadow = true;
      this.table.add(target);
      this.drops.push(target);
    }

    const height = SQUIRREL.b.y - SQUIRREL.a.y;
    this.squirrelTarget = new Mesh(
      new BoxGeometry(4, 20, height),
      new MeshStandardMaterial({
        color: PALETTE.amber,
        emissive: new Color(PALETTE.amber),
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    );
    place(this.squirrelTarget, SQUIRREL.a.x, (SQUIRREL.a.y + SQUIRREL.b.y) / 2, 10);
    this.squirrelTarget.castShadow = true;
    this.table.add(this.squirrelTarget);
  }

  private buildDoghouse(): void {
    const shape = new Shape();
    shape.moveTo(-34, 0);
    shape.lineTo(-34, 26);
    shape.lineTo(0, 46);
    shape.lineTo(34, 26);
    shape.lineTo(34, 0);
    shape.closePath();

    const kennel = new Mesh(
      new ExtrudeGeometry(shape, { depth: 30, bevelEnabled: false }),
      new MeshStandardMaterial({ color: 0x7a4d26, roughness: 0.8 }),
    );
    // Extruded in its own plane, so it is stood up and turned to face down-table.
    kennel.rotation.x = -Math.PI / 2;
    place(kennel, DOGHOUSE.x, DOGHOUSE.y - 4, 0);
    kennel.position.z -= 15;
    kennel.castShadow = true;
    kennel.receiveShadow = true;
    this.table.add(kennel);

    this.doghouseLamp = new Mesh(
      new PlaneGeometry(30, 34),
      new MeshBasicMaterial({
        color: PALETTE.pink,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.doghouseLamp.rotation.x = -Math.PI / 2;
    place(this.doghouseLamp, DOGHOUSE.x, DOGHOUSE.y + 2, LAMP_LIFT);
    this.table.add(this.doghouseLamp);
  }

  private buildFlippers(): void {
    for (let i = 0; i < 2; i++) {
      const flipper = new Mesh(
        new CapsuleGeometry(7, FLIPPER_LENGTH, 6, 14),
        new MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.35, metalness: 0.25 }),
      );
      // A capsule stands up its own y axis; the flipper lies flat and points
      // along the table, so it is tipped over before it is ever swung.
      flipper.rotation.order = 'YXZ';
      flipper.castShadow = true;
      this.table.add(flipper);
      this.flippers.push(flipper);
    }
  }

  /** A lamp is a flat additive panel just above the paint that it lights up. */
  private lamp(width: number, height: number, colour: string, radius: number): Mesh {
    const geometry =
      radius > 0 ? new PlaneGeometry(width, height) : new PlaneGeometry(width, height);
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  private buildLamps(): void {
    for (const lane of TOP_LANES) {
      const mesh = this.lamp(LANE_INSERT.width, LANE_INSERT.height, PALETTE.green, 8);
      place(mesh, lane.center.x, lane.center.y, LAMP_LIFT);
      this.table.add(mesh);
      this.laneLamps.push(mesh);
    }
    for (const spot of MISSION_LAMPS) {
      const mesh = this.lamp(spot.width, spot.height, PALETTE.sky, 6);
      place(mesh, spot.x, spot.y, LAMP_LIFT);
      this.table.add(mesh);
      this.missionLamps.push(mesh);
    }
    for (const arrow of ORBIT_ARROWS) {
      const mesh = this.lamp(22, 28, PALETTE.amber, 0);
      place(mesh, arrow.x, arrow.y, LAMP_LIFT);
      this.table.add(mesh);
      this.orbitLamps.push(mesh);
    }
  }

  private buildPlunger(): void {
    this.plunger = new Mesh(
      new CylinderGeometry(7, 7, 12, 16),
      new MeshStandardMaterial({ color: 0xf0e6ff, roughness: 0.25, metalness: 0.8 }),
    );
    place(this.plunger, PLUNGER_REST.x, PLUNGER_REST.y + 22, 8);
    this.table.add(this.plunger);
  }

  private buildBallPrototype(): void {
    this.ballGeometry = new SphereGeometry(9, 32, 24);
    this.ballMaterial = new MeshStandardMaterial({
      color: 0xf2f5fb,
      roughness: 0.1,
      metalness: 1,
    });
  }

  private ballAt(index: number): Mesh {
    const existing = this.balls[index];
    if (existing) return existing;
    const mesh = new Mesh(this.ballGeometry, this.ballMaterial);
    mesh.castShadow = true;
    this.table.add(mesh);
    this.balls.push(mesh);
    this.ballSpin.push(new Quaternion());
    return mesh;
  }

  // ------------------------------------------------------------------ frame

  /**
   * `hudHeight` and `barHeight` are the bands the overlay covers. The table is
   * fitted to the strip between them and then the frustum is widened back out
   * to the full canvas, so the playfield is centred in the part of the screen
   * the player can actually see rather than behind the score.
   */
  resize(
    width: number,
    height: number,
    pixelRatio: number,
    hudHeight: number,
    barHeight: number,
  ): void {
    this.wantedPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(this.downgraded ? Math.min(1, pixelRatio) : pixelRatio);
    this.renderer.setSize(width, height, false);

    const band = Math.max(120, height - hudHeight - barHeight);
    const aspect = width / band;
    this.camera.aspect = aspect;
    this.camera.setViewOffset(width, band, 0, -hudHeight, width, height);

    // Pull back far enough that the whole table fits, whichever way round the
    // screen is: the length decides it on a phone, the width on a laptop.
    const vFov = (CAMERA_FOV * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const forLength = ((TABLE_HEIGHT / 2) * FORESHORTENING) / Math.tan(vFov / 2);
    const forWidth = ((TABLE_WIDTH / 2) * 1.02) / Math.tan(hFov / 2);
    const distance = Math.max(forLength, forWidth);

    const target = new Vector3(0, 40, 30);
    this.camera.position.set(
      target.x,
      target.y + Math.sin(CAMERA_PITCH) * distance,
      target.z + Math.cos(CAMERA_PITCH) * distance,
    );
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  }

  sync(session: Session, tick: number): void {
    this.syncBalls(session);
    this.syncFlippers(session);
    this.syncTargets(session);
    this.syncLamps(session, tick);
    this.syncPlunger(session);
  }

  private syncBalls(session: Session): void {
    const active = session.activeBalls;
    for (let i = 0; i < this.balls.length; i++) {
      const mesh = this.balls[i];
      if (mesh) mesh.visible = i < active.length;
    }
    active.forEach((ball, index) => {
      const mesh = this.ballAt(index);
      mesh.visible = true;
      place(mesh, ball.x, ball.y, ball.radius + ball.z);

      // Roll it. Going from table axes to world ones swaps two of them, which
      // is a reflection, and an angular velocity is a pseudo-vector: it changes
      // sign under one. Without the minus the ball rolls backwards - which is
      // subtle enough to miss in a screenshot and obvious the moment it moves.
      const spin = this.ballSpin[index];
      if (spin) {
        const angle = Math.hypot(ball.spin.x, ball.spin.y, ball.spin.z);
        if (angle > 1e-5) {
          const axis = new Vector3(-ball.spin.x, -ball.spin.z, -ball.spin.y).normalize();
          spin.premultiply(new Quaternion().setFromAxisAngle(axis, angle));
          mesh.quaternion.copy(spin);
        }
      }
    });

    // A ball held in the saucer is out of play but still on the table.
    if (session.saucer) {
      const mesh = this.ballAt(active.length);
      mesh.visible = true;
      place(mesh, DOGHOUSE.x, DOGHOUSE.y, 6);
    }
  }

  private syncFlippers(session: Session): void {
    session.flippers.forEach((flipper, index) => {
      const mesh = this.flippers[index];
      if (!mesh) return;
      const midX = flipper.pivot.x + (Math.cos(flipper.angle) * FLIPPER_LENGTH) / 2;
      const midY = flipper.pivot.y + (Math.sin(flipper.angle) * FLIPPER_LENGTH) / 2;
      place(mesh, midX, midY, 8);
      mesh.rotation.set(Math.PI / 2, -flipper.angle, 0);
    });
  }

  private syncTargets(session: Session): void {
    this.drops.forEach((mesh, index) => {
      const down = session.dropsDown[index] === true;
      // Dropped targets sink into the playfield rather than vanishing, which is
      // what they do, and it leaves the slot in the paint visible underneath.
      const wanted = down ? -10 : 9;
      mesh.position.y += (wanted - mesh.position.y) * 0.35;
    });
  }

  private syncLamps(session: Session, tick: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(tick / 8);

    LANE_LETTERS.forEach((letter, index) => {
      const mesh = this.laneLamps[index];
      if (mesh) setLamp(mesh, session.score.lanes[letter] ? 0.75 : 0);
    });

    MISSION_LAMPS.forEach((spot, index) => {
      const mesh = this.missionLamps[index];
      if (!mesh) return;
      const done = session.missions.completed.includes(spot.id);
      const running = session.missions.active?.id === spot.id;
      const selected = session.missions.selected === spot.id && !session.missions.active;
      const material = mesh.material as MeshBasicMaterial;
      material.color.set(done ? PALETTE.gold : PALETTE.sky);
      setLamp(mesh, done || running ? 0.7 : selected ? 0.2 + pulse * 0.6 : 0);
    });

    const wantsOrbit =
      session.missions.active !== null &&
      ['fetch', 'walkies'].includes(session.missions.active.id);
    for (const mesh of this.orbitLamps) setLamp(mesh, wantsOrbit ? 0.3 + pulse * 0.6 : 0);

    const doghouse = this.doghouseLamp.material as MeshBasicMaterial;
    doghouse.color.set(session.missions.wizardLit ? PALETTE.gold : PALETTE.pink);
    setLamp(this.doghouseLamp, session.doghouseLit ? 0.35 + pulse * 0.45 : 0.1);

    // The pop bumpers flash from the same list of hits the sound comes from.
    this.bumperCaps.forEach((cap, index) => {
      const bumper = BUMPERS[index];
      const light = this.bumperLights[index];
      if (!bumper || !light) return;
      const struck = session.flashes.some(
        (flash) => Math.hypot(flash.x - bumper.center.x, flash.y - bumper.center.y) < bumper.radius + 10,
      );
      const material = cap.material as MeshStandardMaterial;
      const wanted = struck ? 2.4 : 0.45;
      material.emissiveIntensity += (wanted - material.emissiveIntensity) * 0.35;
      light.intensity += ((struck ? 260 : 0) - light.intensity) * 0.3;
    });
  }

  private syncPlunger(session: Session): void {
    const pulled = session.plungerCharge * 26;
    place(this.plunger, PLUNGER_REST.x, PLUNGER_REST.y + 22 + pulled, 8);
  }

  render(): void {
    this.watchFrameRate();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Drop the expensive half of the lighting on a device that cannot keep up.
   *
   * Shadows and a full-resolution buffer are what make the table look like an
   * object, but a table nobody can play is worth nothing, and this game is
   * aimed at whatever tablet is in the house. So it watches its own frame time
   * and, if it has been genuinely bad for a second and a half rather than for
   * one unlucky frame, gives up the shadows and renders at one device pixel per
   * CSS pixel. It only ever goes one way: a renderer that flips back and forth
   * as the load changes is worse than either setting.
   */
  private watchFrameRate(): void {
    const now = performance.now();
    const elapsed = now - this.lastFrame;
    this.lastFrame = now;
    if (this.downgraded || elapsed <= 0 || elapsed > 1000) return;

    // Two frames' worth of budget at 30fps. Anything slower than this is not a
    // stutter, it is the device telling you what it can do.
    this.slowFrames = elapsed > 66 ? this.slowFrames + 1 : 0;
    if (this.slowFrames < 45) return;

    this.downgraded = true;
    this.renderer.shadowMap.enabled = false;
    this.renderer.setPixelRatio(Math.min(1, this.wantedPixelRatio));
    this.scene.environmentIntensity = 0.5;
    // Materials compiled with shadows baked into them have to be rebuilt.
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.material) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.needsUpdate = true;
      }
    });
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

function setLamp(mesh: Mesh, opacity: number): void {
  const material = mesh.material as MeshBasicMaterial;
  material.opacity += (opacity - material.opacity) * 0.3;
}
