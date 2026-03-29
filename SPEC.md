# Doodle Cube — Technical Specification

A relaxing browser-based 3D toy where you roll a cube across a grid, pick up colors from pools, and paint tiles. No score, no timer — just meditative doodling. Two modes: stamp (paint) and pickup (clear/absorb).

## Architecture

**Two files, zero build step:**
- `index.html` — Shell page, imports Three.js via CDN importmap, loads `game.js`
- `game.js` — All game logic (~655 lines, single ES module)

**Stack:** Three.js r164 (ES modules from jsdelivr CDN), vanilla JS, no framework.

**Hosting:** `busybox httpd` on port 8000, managed by systemd (`cubefun.service`). Accessible at `https://doodlecube.exe.xyz:8000/`.

**Repo:** `https://github.com/timmeeter/doodlecube` (pushed via exe.dev GitHub integration).

**Cache-busting:** `index.html` loads `game.js?v=N` — increment N when deploying changes to force browser refresh.

## Scene Setup

- **Renderer:** WebGL, antialiased, ACES filmic tone mapping, exposure 1.1, max 2x pixel ratio
- **Background:** Dark grey `#1a1a1e`
- **Camera:** Perspective, 55° FOV, at `(31.7, 32, 22.8)` looking at `(18, 0, 16.5)` (grid center + offset to shift board upward on screen). Rotated ~20° clockwise from symmetric isometric to make arrow key directions intuitive.
- **Camera orbit:** Q/E keys rotate camera around grid center; angle and position shown in HUD.
- **Lighting:** Three lights, no shadows:
  - Ambient `#fff5e0` intensity 0.6 (warm fill)
  - Directional sun `#fff0d0` intensity 0.8 from `(20, 40, 15)`
  - Directional fill `#d0e0ff` intensity 0.3 from `(-15, 20, -10)`

## Grid

- **Size:** 10×10 tiles, each `TILE = 3.0` units
- **Tile geometry:** `BoxGeometry(TILE-0.08, 0.15, TILE-0.08)` — slightly inset, thin slab
- **Base color:** Chalky green `#5a7a5a`, roughness 0.85
- **Corner tiles:**
  - `(0,0)` — bright green `#40b040` with circular arrow (↻) SVG icon — **Reset tile**
  - `(9,9)` — amber `#d0a030` with dynamic stamp/broom SVG icon — **Mode toggle tile**
- **Borders:** Thin boxes (`0.08` wide, `0.16` tall) in `#4a6a4a` along all grid lines
- **Tile data:** `{ mesh, baseColor, paintColor, paintOpacity, row, col }`
  - `paintColor`: `null` (empty) or `THREE.Color` of accumulated paint
  - `paintOpacity`: `0..1` — strength of paint layer

## Corner Tile Icons

SVG strings rendered as textures onto `PlaneGeometry(TILE*0.65)` quads lying flat on corner tiles.

- **`svgToTexture(svgString)`** — creates Blob URL, loads via `TextureLoader`, revokes URL on load
- **`placeCornerIcon(r, c, svgString)`** — creates and positions the icon mesh
- **`updateCornerIcon(icon, svgString)`** — swaps texture on the mode toggle tile when mode changes
- **Icon color:** Chalky pastel green `#8ab07a` for all SVG strokes/fills
- **Reset icon:** Circular arrow (always visible)
- **Mode icon:** Stamp shape (in stamp mode) or broom shape (in pickup mode), swapped dynamically

## Game Modes

**`gameMode`** variable: `'stamp'` (default) or `'pickup'`

### Stamp Mode 🎨
Default mode. Rolling over a color pool inks the bottom face. Each subsequent tile landing stamps color from the bottom face onto the tile.

### Pickup Mode 🧹
Toggled by landing on the (9,9) corner. Rolling over painted tiles clears them and absorbs their color into the bottom face. Color blending:
- Empty face → takes tile color directly
- Existing color → lerps face + tile color weighted by ink amounts, snaps to nearest palette color
- Ink accumulates (capped at `MAX_INK`)

### Reset (0,0 corner)
Clears all tile paint, removes and respawns pools randomly, resets all cube face colors, resets faceSlots to identity, resets mode to stamp. Cube stays on the reset tile.

### Mode Toggle (9,9 corner)
Flips `gameMode` between stamp and pickup. Updates HUD text and corner tile icon.

**`updateModeIndicator()`** updates both the HTML HUD element and the corner tile SVG texture.

## Color Pools

**6 colors** used throughout (index 0–5):
```
0: #e06070 (rose)
1: #60a0e0 (sky blue)
2: #e0c050 (golden)
3: #70c080 (mint)
4: #c070d0 (lavender)
5: #f09060 (peach)
```

**10 pools** randomly placed each game. Placement avoids cube start `(4,4)`, reset corner `(0,0)`, and mode toggle corner `(9,9)`. Color assignment cycles through the 6 colors.

Each pool consists of:
- **Disc:** `CylinderGeometry` radius `TILE*0.38`, emissive material
- **Glow ring:** `RingGeometry` with pulsing transparent material
- **Animation:** `updatePools(time)` pulses opacity (`sin` wave) and bobs disc vertically

**Pool management functions:**
- `randomPoolPositions(count)` — generates random non-overlapping positions
- `spawnPool(r, c, colorIndex)` — creates a single pool with disc + glow
- `removeAllPools()` — disposes and removes all pool meshes
- `spawnRandomPools()` — removes existing, generates and spawns fresh set

**Consumption:** When a cube face picks up from a pool, the pool is removed from the scene (`scene.remove`, geometry/material disposed, deleted from `poolMap` and `pools` array).

## Cube

- **Geometry:** `BoxGeometry(TILE, TILE, TILE)` — face size matches tile size
- **Base color:** Warm cream `#e8e0d0`
- **Structure:** `cubeMesh` (the box) is child of `cubePivot` (Group), offset at `(0, HALF, 0)`. Pivot sits at ground level at the cube's grid position.
- **Start position:** Grid `(4, 4)` (center of 10×10)

### Face Color System

**6 faces** tracked independently. Three.js BoxGeometry face order: `+X, -X, +Y, -Y, +Z, -Z` (indices 0–5).

- `faceColors[i]`: `null` (clean) or `{ colorIndex, ink }` for original face `i`
- `MAX_INK = 8` — stamps available per pickup
- `faceSlots[i]` — maps geometric position `i` to the original face index currently there
  - Starts as `[0,1,2,3,4,5]` (identity)
  - Updated by `rotateFaceSlots(dir)` after each roll
  - Positions: `0=+X(right), 1=-X(left), 2=+Y(top), 3=-Y(bottom), 4=+Z(front), 5=-Z(back)`

**Material generation** (`makeCubeMaterials()`): Maps through `faceSlots` — material for geometric position `i` looks up `faceColors[faceSlots[i]]`. Ink strength (`ink/MAX_INK`) controls lerp between cream base and pool color, plus emissive intensity. Materials are rebuilt (full array replacement on `cubeMesh.material`) after every roll completion.

### Face Rotation Rules

`rotateFaceSlots(dir)` cycles 4 slots per direction, leaving the perpendicular axis pair untouched:

| Direction | Cycle (slot indices) | Untouched |
|-----------|---------------------|-----------|
| north (row-1, -Z) | 2→5→3→4→2 (top→back→bottom→front) | 0,1 (±X) |
| south (row+1, +Z) | 2→4→3→5→2 (top→front→bottom→back) | 0,1 (±X) |
| east (col+1, +X) | 2→0→3→1→2 (top→right→bottom→left) | 4,5 (±Z) |
| west (col-1, -X) | 2→1→3→0→2 (top→left→bottom→right) | 4,5 (±Z) |

`getBottomFace()` returns `faceSlots[3]` — the original face index currently at the -Y position.

## Rolling Animation

**Anchor-based rotation:** A `rollAnchor` Group is placed at the cube's leading bottom edge. The `cubePivot` is temporarily reparented under it. The anchor rotates 90° around the appropriate axis, then the pivot is reparented back to the scene and snapped to the new grid position.

**Sequence:**
1. `startRoll(dir)`: Validate bounds, place anchor at edge, reparent pivot, set axis
2. `updateRoll(dt)`: Advance `rollTime`, compute smoothstep-eased angle, apply to `rollAnchor.rotation`
3. At `t >= 1.0`: Unparent, snap to grid, rotate face slots, update materials, handle pool pickup, check corners, handle stamp/pickup mode, process queue

**Timing:** `ROLL_DURATION = 0.3s`, smoothstep easing `t²(3-2t)`

**Rotation axes** (the anchor is at the leading edge, so the cube arcs UP and over):
| Direction | Axis |
|-----------|------|
| north | `(-1, 0, 0)` |
| south | `(1, 0, 0)` |
| east | `(0, 0, -1)` |
| west | `(0, 0, 1)` |

**Input queue:** Up to 3 buffered moves. Processed sequentially after each roll completes.

## Roll Completion Logic (order matters)

1. **Face slot rotation** + material update
2. **Pool pickup** — if tile has a pool, bottom face gets `{ colorIndex, ink: MAX_INK }`, pool consumed
3. **Reset corner** `(0,0)` — calls `resetBoard()`, returns early
4. **Mode toggle** `(9,9)` — flips `gameMode`, updates indicator
5. **Pickup mode** — if tile is painted: find nearest palette color via `colorDist()`, blend into bottom face, clear tile. Returns early.
6. **Stamp mode** — if bottom face has ink: stamp tile, decrement ink
7. **Process queue**

## Painting (Stamp Mode)

If bottom face has `ink > 0`:
- `stampStrength = ink / MAX_INK`
- **Empty tile:** `paintColor = stampColor`, `paintOpacity = stampStrength`
- **Existing paint:** Alpha-composite blend — colors weighted by relative opacity, total opacity approaches 1.0 asymptotically
- **Visual:** Tile mesh color = `baseColor.lerp(paintColor, paintOpacity)`, emissive = `paintColor` at `0.1 * paintOpacity`
- Ink decremented; at 0 the face is set to `null` (clean)

## Clearing (Pickup Mode)

If tile has `paintColor !== null && paintOpacity > 0`:
- Find nearest palette color to tile's paint via `colorDist()` (Euclidean RGB distance)
- Compute ink amount: `max(1, round(paintOpacity * MAX_INK))`
- **Empty face:** absorbs tile color directly
- **Existing face color:** blends via `lerp` weighted by ink ratio, snaps to nearest palette, ink accumulates (capped at `MAX_INK`)
- Tile cleared: `paintColor = null`, `paintOpacity = 0`, mesh reset to base color

**`colorDist(a, b)`** helper: `sqrt((a.r-b.r)² + (a.g-b.g)² + (a.b-b.b)²)` — needed because `THREE.Color` has no `distanceTo` method.

## Controls

**Isometric-mapped** — keys align to screen directions, not world axes:

| Key | Screen direction | Grid direction |
|-----|-----------------|----------------|
| ↑ / W | Screen up | west (col-1) |
| ↓ / S | Screen down | east (col+1) |
| → / D | Screen right | north (row-1) |
| ← / A | Screen left | south (row+1) |
| Q | Rotate camera CCW | — |
| E | Rotate camera CW | — |

**Touch:** Swipe detection with 30px minimum threshold, same isometric mapping.

## Known Behaviors & Design Decisions

- **Face rotation means paint is intermittent.** Rolling in one direction doesn't paint every tile — only when the colored face rotates back to bottom (every 4th step in a straight line). This is intentional and creates interesting patterns.
- **Pools are randomized** and respawn on reset. 10 pools per game.
- **Colors blend on tiles.** Stamping different colors on the same tile mixes them with alpha-composite logic.
- **Ink fades visually** on both the cube face and the painted tiles — first stamp is vivid, last is a whisper.
- **Reset keeps cube in place** on the reset tile rather than moving to center.
- **Pickup blends into face** — rolling over many painted tiles in pickup mode accumulates a blended color.
- **`file://` won't work** — ES module CORS policy blocks `game.js` loading from filesystem. Use any HTTP server.

## File Structure

```
cubefun/
├── index.html          # HTML shell, CDN imports, UI overlay, cache-busted game.js
├── game.js             # All game logic (~655 lines, single ES module)
├── cubefun.service     # systemd unit (busybox httpd on port 8000)
├── PLAN.md             # Vision and backlog
└── SPEC.md             # This file
```

## Git Tags

- `v1.0` — Fully working base game (stamp only, fixed pool positions, symmetric camera)

## Coordinate System Reference

- **Three.js:** Y-up, right-handed. +X = right, +Y = up, +Z = toward camera.
- **Grid:** `row` maps to Z axis (row 0 = Z near 0, row 9 = Z near 30). `col` maps to X axis.
- **World position of tile (r,c):** `x = c * 3.0 + 1.5, y = 0, z = r * 3.0 + 1.5`
- **Camera** at `(31.7, 32, 22.8)` — rotated isometric view from the +X, +Z quadrant, ~20° off symmetric.
