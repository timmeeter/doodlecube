# Doodle Cube - Current Vision & Technical Plan

## Original Vision
A relaxing, meditative 3D "toy" game where the player controls a cube that rolls around a surface, picking up colors from pools and painting the ground. Think of it as a phone-doodling alternative - no competitive elements, just soft aesthetics and tactile satisfaction.

## Current State (Web/Three.js Implementation)

### Working Features ✅
- **10x10 grid playground** with chalky green tiles and visible borders
- **Corner markers**: (0,0) bright green, (9,9) bright yellow
- **Warm cream cube** centered on grid
- **Dark theme** background with warm ACES filmic tone mapping
- **Isometric camera** at (28, 32, 28) with 45° FOV
- **Rolling movement**: Cube tips/rotates 90° around bottom edge
- **6-face color tracking**: Each face independently tracks absorbed color
- **10 color pools**: Rose, sky blue, golden, mint, lavender, peach
- **Pool glow animation**: Pulsing opacity and emissive effects
- **Tile painting**: Bottom face paints tiles as cube rolls
- **Color blending**: Overlapping paint blends with existing tile color
- **Input queuing**: Up to 2 moves buffered for smooth play
- **Touch/swipe support**: Mobile-friendly
- **Keyboard**: Arrow keys + WASD

### Technical Stack
- **Three.js** r164 via CDN (ES modules)
- **Pure HTML/JS** - no build step, no dependencies
- **busybox httpd** serving static files on port 8000
- **systemd service** for persistent hosting

## Next Steps
1. Polish paint appearance (softer blending, maybe glow)
2. Add subtle particle effects on color pickup
3. Sound effects (rolling, color chime)
4. More pools or pool regeneration
5. Larger grid or infinite scrolling
