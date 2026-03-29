# Doodle Cube - Current Vision & Technical Plan

## Original Vision
A relaxing, meditative 3D "toy" game where the player controls a cube that rolls around a surface, picking up colors from pools and painting the ground. Think of it as a phone-doodling alternative - no competitive elements, just soft aesthetics and tactile satisfaction.

## Current State (v1.0+ / Web/Three.js Implementation)

### Working Features ✅
- **10x10 grid playground** with chalky green tiles and visible borders
- **Two game modes** toggled via corner tile:
  - **Stamp mode** 🎨 — roll over pools, paint tiles with inked cube faces
  - **Pickup mode** 🧹 — roll over painted tiles to absorb color and clear them
- **Special corner tiles** with SVG icons:
  - **(0,0) Reset** (green, ↻ icon) — clears all paint, respawns pools, resets cube faces
  - **(9,9) Mode toggle** (amber, stamp/broom icon) — switches between stamp and pickup
- **Randomized color pools** — 10 pools placed randomly each game/reset
- **Warm cream cube** starting at grid center (4,4)
- **Dark theme** background with warm ACES filmic tone mapping
- **Rotated isometric camera** at ~20° off symmetric (position `31.7, 32, 22.8`), 55° FOV
- **Camera orbit** via Q/E keys for fine-tuning view angle
- **Rolling movement**: Cube tips/rotates 90° around bottom edge with smoothstep easing
- **6-face color tracking**: Each face independently tracks absorbed color and ink level
- **6 pool colors**: Rose, sky blue, golden, mint, lavender, peach
- **Pool glow animation**: Pulsing opacity and emissive effects, vertical bobbing
- **Tile painting**: Bottom face paints tiles with alpha-composite color blending
- **Pickup blending**: Absorbed tile color blends into existing face color
- **Input queuing**: Up to 3 moves buffered for smooth play
- **Touch/swipe support**: Mobile-friendly
- **Keyboard**: Arrow keys + WASD (isometric-mapped)

### Technical Stack
- **Three.js** r164 via CDN (ES modules from jsdelivr)
- **Pure HTML/JS** — no build step, no dependencies
- **busybox httpd** serving static files on port 8000
- **systemd service** (`cubefun.service`) for persistent hosting
- **Git tags**: `v1.0` = base game before game modes

## Next Steps / Backlog
1. Color mixing when multiple face colors overlap
2. Subtle particle effects on color pickup
3. Sound effects (rolling, color chime, mode switch)
4. Pool respawning over time
5. Larger grid or infinite scrolling
6. Undo mechanism
7. Save/load painted patterns
8. Mobile UI improvements
