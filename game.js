import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────
const TILE = 3.0;
const GRID = 10;
const HALF = TILE / 2;
const ROLL_DURATION = 0.3; // seconds per roll
const COLORS = [
  0xe06070, // rose
  0x60a0e0, // sky blue
  0xe0c050, // golden
  0x70c080, // mint
  0xc070d0, // lavender
  0xf09060, // peach
];

// ── Scene setup ────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1e);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(28, 32, 28);
camera.lookAt(GRID * TILE / 2, 0, GRID * TILE / 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// ── Lighting (warm, soft) ──────────────────────────────────
const ambient = new THREE.AmbientLight(0xfff5e0, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0d0, 0.8);
sun.position.set(20, 40, 15);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd0e0ff, 0.3);
fill.position.set(-15, 20, -10);
scene.add(fill);

// ── Grid / Tiles ───────────────────────────────────────────
const tileGroup = new THREE.Group();
scene.add(tileGroup);

// Each tile: { mesh, baseColor, paintColor, row, col }
const tiles = [];
const tileMap = {}; // "row,col" -> tile

const chalkyGreen = new THREE.Color(0x5a7a5a);
const tileBorderColor = new THREE.Color(0x4a6a4a);

for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    // Main tile face
    const geo = new THREE.BoxGeometry(TILE - 0.08, 0.15, TILE - 0.08);
    let col = chalkyGreen.clone();
    // Corner markers
    if (r === 0 && c === 0) col.set(0x40b040);
    if (r === GRID - 1 && c === GRID - 1) col.set(0xc0c040);
    const mat = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.85, metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c * TILE + HALF, -0.075, r * TILE + HALF);
    tileGroup.add(mesh);
    // paintColor: THREE.Color of accumulated paint, paintOpacity: 0..1 strength
    const tile = { mesh, baseColor: col.clone(), paintColor: null, paintOpacity: 0, row: r, col: c };
    tiles.push(tile);
    tileMap[`${r},${c}`] = tile;
  }
}

// Thin border lines between tiles
const borderMat = new THREE.MeshStandardMaterial({ color: tileBorderColor, roughness: 0.9 });
for (let r = 0; r <= GRID; r++) {
  const geo = new THREE.BoxGeometry(GRID * TILE, 0.16, 0.08);
  const m = new THREE.Mesh(geo, borderMat);
  m.position.set(GRID * TILE / 2, -0.07, r * TILE);
  tileGroup.add(m);
}
for (let c = 0; c <= GRID; c++) {
  const geo = new THREE.BoxGeometry(0.08, 0.16, GRID * TILE);
  const m = new THREE.Mesh(geo, borderMat);
  m.position.set(c * TILE, -0.07, GRID * TILE / 2);
  tileGroup.add(m);
}

// ── Color Pools ────────────────────────────────────────────
const poolPositions = [
  { r: 1, c: 2, color: 0 },
  { r: 3, c: 7, color: 1 },
  { r: 7, c: 1, color: 2 },
  { r: 8, c: 8, color: 3 },
  { r: 2, c: 5, color: 4 },
  { r: 6, c: 4, color: 5 },
  { r: 5, c: 9, color: 0 },
  { r: 9, c: 3, color: 1 },
  { r: 0, c: 8, color: 2 },
  { r: 4, c: 0, color: 3 },
];

const pools = []; // { r, c, colorIndex, mesh, glowMesh }
const poolMap = {}; // "r,c" -> pool

poolPositions.forEach(({ r, c, color }) => {
  const poolColor = new THREE.Color(COLORS[color]);
  // Pool disc
  const geo = new THREE.CylinderGeometry(TILE * 0.38, TILE * 0.38, 0.06, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: poolColor, roughness: 0.4, metalness: 0.1,
    emissive: poolColor, emissiveIntensity: 0.3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(c * TILE + HALF, 0.03, r * TILE + HALF);
  scene.add(mesh);

  // Glow ring
  const glowGeo = new THREE.RingGeometry(TILE * 0.35, TILE * 0.45, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: poolColor, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.rotation.x = -Math.PI / 2;
  glowMesh.position.set(c * TILE + HALF, 0.02, r * TILE + HALF);
  scene.add(glowMesh);

  const pool = { r, c, colorIndex: color, mesh, glowMesh };
  pools.push(pool);
  poolMap[`${r},${c}`] = pool;
});

// ── Cube ───────────────────────────────────────────────────
// Face order: +X, -X, +Y, -Y, +Z, -Z
// Each face: null (clean) or { colorIndex, ink } where ink = remaining stamps
const MAX_INK = 8;
const faceColors = [null, null, null, null, null, null];
const baseCubeColor = new THREE.Color(0xe8e0d0); // warm cream

// Face orientation tracking:
// faceSlots[i] = which original face index is now at geometric position i
// Positions: 0=+X(right), 1=-X(left), 2=+Y(top), 3=-Y(bottom), 4=+Z(front), 5=-Z(back)
let faceSlots = [0, 1, 2, 3, 4, 5];

function makeCubeMaterials() {
  // Material[i] = geometric face position i, but the original face at
  // that position is faceSlots[i]. Look up color by original face index.
  return faceSlots.map(originalFace => {
    const fc = faceColors[originalFace];
    if (fc === null) {
      return new THREE.MeshStandardMaterial({
        color: baseCubeColor.clone(), roughness: 0.6, metalness: 0.05,
      });
    }
    const strength = fc.ink / MAX_INK;
    const poolCol = new THREE.Color(COLORS[fc.colorIndex]);
    const c = baseCubeColor.clone().lerp(poolCol, strength);
    return new THREE.MeshStandardMaterial({
      color: c, roughness: 0.6, metalness: 0.05,
      emissive: poolCol,
      emissiveIntensity: 0.15 * strength,
    });
  });
}

const cubeGeo = new THREE.BoxGeometry(TILE, TILE, TILE);
const cubeMesh = new THREE.Mesh(cubeGeo, makeCubeMaterials());

// Pivot for rolling animation
const cubePivot = new THREE.Group();
scene.add(cubePivot);
cubePivot.add(cubeMesh);
cubeMesh.position.set(0, HALF, 0);

// Cube grid position
let cubeRow = 4, cubeCol = 4;
cubePivot.position.set(cubeCol * TILE + HALF, 0, cubeRow * TILE + HALF);

// When cube rolls in a direction, faces rotate:
function rotateFaceSlots(dir) {
  const s = [...faceSlots];
  switch (dir) {
    case 'north': // -Z rotation (roll forward, around X axis)
      faceSlots[2] = s[4]; // top <- front
      faceSlots[5] = s[2]; // back <- top
      faceSlots[3] = s[5]; // bottom <- back  
      faceSlots[4] = s[3]; // front <- bottom
      break;
    case 'south': // +Z rotation (roll backward, around X axis)
      faceSlots[2] = s[5]; // top <- back
      faceSlots[4] = s[2]; // front <- top
      faceSlots[3] = s[4]; // bottom <- front
      faceSlots[5] = s[3]; // back <- bottom
      break;
    case 'east': // +X rotation (roll right, around Z axis)
      faceSlots[2] = s[1]; // top <- left
      faceSlots[0] = s[2]; // right <- top
      faceSlots[3] = s[0]; // bottom <- right
      faceSlots[1] = s[3]; // left <- bottom
      break;
    case 'west': // -X rotation (roll left, around Z axis)
      faceSlots[2] = s[0]; // top <- right
      faceSlots[1] = s[2]; // left <- top
      faceSlots[3] = s[1]; // bottom <- left
      faceSlots[0] = s[3]; // right <- bottom
      break;
  }
}

function getBottomFace() {
  return faceSlots[3]; // index 3 = -Y = bottom
}

function updateCubeMaterials() {
  cubeMesh.material = makeCubeMaterials();
}

// ── Rolling Animation ──────────────────────────────────────
// Strategy: use a separate "rollAnchor" group positioned at the bottom edge.
// Parent the cubePivot under it, then just rotate the anchor.
const rollAnchor = new THREE.Group();
scene.add(rollAnchor);

let rolling = false;
let rollQueue = [];
let rollTime = 0;
let rollDir = null;
let rollAxis = new THREE.Vector3();

function startRoll(dir) {
  if (rolling) {
    if (rollQueue.length < 3) rollQueue.push(dir);
    return;
  }

  let dr = 0, dc = 0;
  switch (dir) {
    case 'north': dr = -1; break;
    case 'south': dr = 1; break;
    case 'east': dc = 1; break;
    case 'west': dc = -1; break;
  }

  const nr = cubeRow + dr;
  const nc = cubeCol + dc;
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return;

  rolling = true;
  rollDir = dir;
  rollTime = 0;

  // The bottom edge in the direction of travel
  const edgeX = cubePivot.position.x + dc * HALF;
  const edgeZ = cubePivot.position.z + dr * HALF;

  // Place anchor at the bottom edge
  rollAnchor.position.set(edgeX, 0, edgeZ);
  rollAnchor.rotation.set(0, 0, 0);

  // Reparent cubePivot under rollAnchor (adjust for anchor offset)
  scene.remove(cubePivot);
  rollAnchor.add(cubePivot);
  cubePivot.position.set(-dc * HALF, 0, -dr * HALF);
  cubePivot.rotation.set(0, 0, 0);
  cubeMesh.position.set(0, HALF, 0);

  // Rotation axis (perpendicular to movement, using right-hand rule)
  // For north (dr=-1, -Z): cube tips forward, top falls toward -Z → rotate around +X
  // Actually: "north" means row decreases (-Z in world). The top of the cube
  // should tip toward -Z. Right-hand rule around X: +angle rotates Y toward Z,
  // -angle rotates Y toward -Z. We want Y→-Z, so negative X rotation.
  // But our anchor is at the -Z edge, so rotating the anchor by -π/2 around X
  // will swing the cube center from above the edge to the -Z side. Let's verify:
  // Cube center starts at (0, HALF, +HALF) relative to anchor (since anchor is at -Z edge).
  // Rotating -90° around X: Y→+Z, Z→-Y. So (0, HALF, HALF) → (0, HALF→+Z=HALF, HALF→-Y=-HALF).
  // Hmm no. Let's just think physically:
  // Anchor is at the leading bottom edge. We need the cube to "fall forward" over that edge.
  // That means the part of the cube above the anchor swings DOWN and FORWARD.
  // The cube center is behind and above the anchor. It needs to end up in front and at same height.
  //
  // North (moving toward -Z): anchor at -Z edge of cube.
  //   Cube center relative to anchor: (0, HALF, +HALF)
  //   After 90° roll it should be at: (0, HALF, -HALF) but adjusted... actually (0, HALF, -HALF) from new anchor perspective.
  //   We need (0, +HALF, +HALF) to rotate to (0, -HALF, +HALF)... no.
  //   Let me just use: positive rotation around X takes +Y toward +Z.
  //   We want +Y to go toward -Z, so NEGATIVE X rotation.
  switch (dir) {
    case 'north': rollAxis.set(-1, 0, 0); break; // tip toward -Z
    case 'south': rollAxis.set(1, 0, 0); break;  // tip toward +Z  
    case 'east':  rollAxis.set(0, 0, -1); break;  // tip toward +X
    case 'west':  rollAxis.set(0, 0, 1); break;   // tip toward -X
  }

  cubeRow = nr;
  cubeCol = nc;
}

function updateRoll(dt) {
  if (!rolling) return;
  rollTime += dt;
  const t = Math.min(rollTime / ROLL_DURATION, 1.0);
  // Smoothstep easing
  const s = t * t * (3 - 2 * t);
  const angle = s * Math.PI / 2;

  // Apply rotation to anchor
  rollAnchor.rotation.set(
    rollAxis.x * angle,
    rollAxis.y * angle,
    rollAxis.z * angle
  );



  if (t >= 1.0) {
    // Unparent: put cubePivot back in scene
    rollAnchor.remove(cubePivot);
    scene.add(cubePivot);

    // Snap to grid
    rolling = false;
    cubePivot.position.set(cubeCol * TILE + HALF, 0, cubeRow * TILE + HALF);
    cubePivot.rotation.set(0, 0, 0);
    cubeMesh.position.set(0, HALF, 0);

    // Update face tracking and always refresh materials to match new orientation
    rotateFaceSlots(rollDir);
    updateCubeMaterials();

    // Bottom face index (in the original face array)
    const bottomFace = getBottomFace();

    // Check for color pool pickup — refills the bottom face to full ink, consumes pool
    const poolKey = `${cubeRow},${cubeCol}`;
    if (poolMap[poolKey]) {
      const pool = poolMap[poolKey];
      faceColors[bottomFace] = { colorIndex: pool.colorIndex, ink: MAX_INK };
      updateCubeMaterials();
      // Remove pool from scene
      scene.remove(pool.mesh);
      scene.remove(pool.glowMesh);
      pool.mesh.geometry.dispose();
      pool.mesh.material.dispose();
      pool.glowMesh.geometry.dispose();
      pool.glowMesh.material.dispose();
      delete poolMap[poolKey];
      const idx = pools.indexOf(pool);
      if (idx !== -1) pools.splice(idx, 1);
    }

    // Paint tile if bottom face has ink remaining
    const face = faceColors[bottomFace];
    if (face !== null && face.ink > 0) {
      const tileKey = `${cubeRow},${cubeCol}`;
      const tile = tileMap[tileKey];
      if (tile) {
        const stampStrength = face.ink / MAX_INK; // 1.0 at full, fading
        const stampColor = new THREE.Color(COLORS[face.colorIndex]);

        if (tile.paintColor === null) {
          // Empty tile: stamp color at stamp strength
          tile.paintColor = stampColor.clone();
          tile.paintOpacity = stampStrength;
        } else {
          // Blend new stamp into existing paint
          // Weight by relative opacity: existing vs incoming
          const totalOpacity = tile.paintOpacity + stampStrength * (1 - tile.paintOpacity);
          const existingWeight = tile.paintOpacity / totalOpacity;
          const newWeight = 1 - existingWeight;
          tile.paintColor.lerp(stampColor, newWeight);
          tile.paintOpacity = Math.min(totalOpacity, 1.0);
        }

        // Apply to mesh: lerp base tile color toward paint by paint opacity
        const final = tile.baseColor.clone().lerp(tile.paintColor, tile.paintOpacity);
        tile.mesh.material.color.copy(final);
        tile.mesh.material.emissive.copy(tile.paintColor);
        tile.mesh.material.emissiveIntensity = 0.1 * tile.paintOpacity;

        // Consume ink and update cube face appearance
        face.ink--;
        if (face.ink <= 0) {
          faceColors[bottomFace] = null; // fully spent
        }
        updateCubeMaterials();
      }
    }

    // Process queue
    if (rollQueue.length > 0) {
      startRoll(rollQueue.shift());
    }
  }
}

// ── Input ──────────────────────────────────────────────────
// Keys mapped to isometric view: screen-up = northwest, screen-right = northeast, etc.
window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': startRoll('west'); break;
    case 'ArrowDown': case 's': case 'S': startRoll('east'); break;
    case 'ArrowRight': case 'd': case 'D': startRoll('north'); break;
    case 'ArrowLeft': case 'a': case 'A': startRoll('south'); break;
  }
});

// ── Touch / swipe support ──────────────────────────────────
let touchStart = null;
window.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
});
window.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (Math.max(adx, ady) < 30) return; // too small
  if (adx > ady) {
    startRoll(dx > 0 ? 'north' : 'south');
  } else {
    startRoll(dy > 0 ? 'east' : 'west');
  }
  touchStart = null;
});

// ── Pool glow animation ───────────────────────────────────
function updatePools(time) {
  pools.forEach((p, i) => {
    const pulse = 0.15 + 0.1 * Math.sin(time * 2 + i * 1.3);
    p.glowMesh.material.opacity = pulse;
    p.mesh.material.emissiveIntensity = 0.2 + 0.15 * Math.sin(time * 2.5 + i);
    p.mesh.position.y = 0.03 + 0.015 * Math.sin(time * 1.8 + i * 0.7);
  });
}

// ── Resize ─────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Game loop ──────────────────────────────────────────────
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();
  updateRoll(dt);
  updatePools(time);
  renderer.render(scene, camera);
}
animate();
