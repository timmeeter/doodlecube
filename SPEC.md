# Cube Doodle — Technical Specification

A relaxing browser-based 3D toy where you roll a cube across a grid, pick up colors from pools, and paint tiles. No score, no timer — just meditative doodling.

## Architecture

**Two files, zero build step:**
- `index.html` — Shell page, imports Three.js via CDN importmap, loads `game.js`
- `game.js` — All game logic (~450 lines, single ES module)

**Stack:** Three.js r164 (ES modules from jsdelivr CDN), vanilla JS, no framework.

**Hosting:** `busybox httpd` on port 8000, managed by systemd (`cubefun.service`). Accessible at `https://cubedoodle.exe.xyz:8000/`.

**Repo:** `https://github.com/timmeeter/cubedoodle` (pushed via exe.dev GitHub integration).

## Scene Setup

- **Renderer:** WebGL, antialiased, ACES filmic tone mapping, exposure 1.1, max 2x pixel ratio
- **Background:** Dark grey `#1a1a1e`
- **Camera:** Perspective, 45° FOV, at `(28, 32, 28)` looking at grid center `(15, 0, 15)`
- **Lighting:** Three lights, no shadows:
  - Ambient `#fff5e0` intensity 0.6 (warm fill)
  - Directional sun `#fff0d0` intensity 0.8 from `(20, 40, 15)`
  - Directional fill `#d0e0ff` intensity 0.3 from `(-15, 20, -10)`

## Grid

- **Size:** 10×10 tiles, each `TILE = 3.0` units
- **Tile geometry:** `BoxGeometry(TILE-0.08, 0.15, TILE-0.08)` — slightly inset, thin slab
- **Base color:** Chalky green `#5a7a5a`, roughness 0.85
- **Corner markers:** `(0,0)` bright green `#40b040`, `(9,9)` bright yellow `#c0c040`
- **Borders:** Thin boxes (`0.08` wide, `0.16` tall) in `#4a6a4a` along all grid lines
- **Tile data:** `{ mesh, baseColor, paintColor, paintOpacity, row, col }`
  - `paintColor`: `null` (empty) or `THREE.Color` of accumulated paint
  - `paintOpacity`: `0..1` — strength of paint layer

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

**10 pools** at fixed grid positions, each assigned a color index. Each pool consists of:
- **Disc:** `CylinderGeometry` radius `TILE*0.38`, emissive material
- **Glow ring:** `RingGeometry` with pulsing transparent material
- **Animation:** `updatePools(time)` pulses opacity (`sin` wave) and bobs disc vertically

**Consumption:** When a cube face picks up from a pool, the pool is removed from the scene (`scene.remove`, geometry/material disposed, deleted from `poolMap` and `pools` array). Pools do not regenerate.

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
3. At `t >= 1.0`: Unparent, snap to grid, rotate face slots, update materials, handle pickup/paint, process queue

**Timing:** `ROLL_DURATION = 0.3s`, smoothstep easing `t²(3-2t)`

**Rotation axes** (the anchor is at the leading edge, so the cube arcs UP and over):
| Direction | Axis |
|-----------|------|
| north | `(-1, 0, 0)` |
| south | `(1, 0, 0)` |
| east | `(0, 0, -1)` |
| west | `(0, 0, 1)` |

**Input queue:** Up to 3 buffered moves. Processed sequentially after each roll completes.

## Painting

On roll completion, after face slot rotation:

1. **Pool pickup:** If cube lands on a pool tile, the bottom face gets `{ colorIndex, ink: MAX_INK }`. Pool is consumed.
2. **Stamping:** If bottom face has `ink > 0`:
   - `stampStrength = ink / MAX_INK`
   - **Empty tile:** `paintColor = stampColor`, `paintOpacity = stampStrength`
   - **Existing paint:** Alpha-composite blend — colors weighted by relative opacity, total opacity approaches 1.0 asymptotically
   - **Visual:** Tile mesh color = `baseColor.lerp(paintColor, paintOpacity)`, emissive = `paintColor` at `0.1 * paintOpacity`
   - Ink decremented; at 0 the face is set to `null` (clean)

## Controls

**Isometric-mapped** — keys align to screen directions, not world axes:

| Key | Screen direction | Grid direction |
|-----|-----------------|----------------|
| ↑ / W | Screen up | west (col-1) |
| ↓ / S | Screen down | east (col+1) |
| → / D | Screen right | north (row-1) |
| ← / A | Screen left | south (row+1) |

**Touch:** Swipe detection with 30px minimum threshold, same isometric mapping.

## Known Behaviors & Design Decisions

- **Face rotation means paint is intermittent.** Rolling in one direction doesn't paint every tile — only when the colored face rotates back to bottom (every 4th step in a straight line). This is intentional and creates interesting patterns.
- **Pools are finite.** Once picked up, they're gone. 10 pools total.
- **Colors blend on tiles.** Stamping different colors on the same tile mixes them with alpha-composite logic.
- **Ink fades visually** on both the cube face and the painted tiles — first stamp is vivid, last is a whisper.
- **No reset mechanism** currently — refresh the page to start over.

## File Structure

```
cubefun/
├── index.html          # HTML shell, CDN imports, UI overlay
├── game.js             # All game logic (Three.js scene, cube, grid, pools, input)
├── cubefun.service     # systemd unit (busybox httpd on port 8000)
├── PLAN.md             # Original vision document
└── SPEC.md             # This file
```

## Coordinate System Reference

- **Three.js:** Y-up, right-handed. +X = right, +Y = up, +Z = toward camera.
- **Grid:** `row` maps to Z axis (row 0 = Z near 0, row 9 = Z near 30). `col` maps to X axis.
- **World position of tile (r,c):** `x = c * 3.0 + 1.5, y = 0, z = r * 3.0 + 1.5`
- **Camera** at `(28, 32, 28)` — isometric-ish view from the +X, +Z quadrant looking toward origin.
