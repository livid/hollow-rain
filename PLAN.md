# Hollow Rain — pixel-art Halloween diorama

A looping, animated pixel-art cover for a 10-hour lofi music video. A floating chunk of haunted
land sits in a cold rainstorm, with warm light coming from windows, a lantern, jack-o'-lanterns and a campfire.

## Goals

- **Crisp at 1080p**: pixels stay perfectly square and sharp full-screen, with no blur or uneven pixel sizes.
- **Seamless loop**: the last frame flows into the first with no visible jump. It runs for hours with
  no drift, slowdown or memory growth.
- **Warm vs. cold**: the night is cold blue and slate. Warm light spills from a few small places.
- **Effects**: rain, fire sparks, drifting smoke and flickering light, plus puddle reflections and mist.
- **Two outputs**: a live page (published artifact and local `index.html`) and an MP4 of one loop
  for the video edit.

## Resolution and scaling

- Internal canvas **480×270**, scaled up **exactly 4×** to 1920×1080. Every art pixel covers 4×4 screen pixels.
- Other screen sizes: scale `s = round(min(w/480, h/270))`, lowered by one step if needed so the
  440×250 core stays visible. The internal size becomes `ceil(w/s) × ceil(h/s)`, and the sky, rain and mist
  extend into the extra space, so the picture is never stretched or letterboxed.
- Upscaling uses nearest-neighbor into a display canvas sized in device pixels (handles `devicePixelRatio`).

## Loop design

- Loop length **T = 120 s**. Every animated value is a pure function of `u = (t mod T) / T`.
- Rules that guarantee the seam:
  - Oscillations use `sin(2π·n·u + φ)` with **integer n** (cycles per loop).
  - Particles (rain, sparks, smoke, splashes) use `fract(k·u + φ)` with **integer k**.
  - Noise (fire, clouds, fog) is **tileable** and scrolls a whole number of tiles per loop.
- No state carries over between frames, so nothing can accumulate or drift. Buffers are allocated once,
  with no allocations per frame (no garbage-collection hitches).
- Seam test: render `t = 0` and `t = T` and check that the buffers are byte-identical.

## Palette

Hue-shifted ramps: shadows go toward cold blue-violet and lit areas toward amber.

| Role | Hex |
|---|---|
| Void / deep sky | `#0a0c18` |
| Night indigo | `#141a2e` |
| Storm slate | `#24304a` |
| Rain blue | `#5b7396` |
| Mist | `#8fa3bd` |
| Moon | `#dfe6ea` |
| Ember red | `#7a2a1e` |
| Pumpkin | `#d8662a` |
| Lamp amber | `#f0a040` |
| Candle yellow | `#ffd27a` |
| Hot core | `#fff4d6` |

Each material (grass, soil, wood, stone, roof, pumpkin skin, bark) has an 8-step ramp:
steps 0–3 are cold night shades, and steps 4–7 are warm lit shades.

## Scene layout (stage coordinates, 480×270)

- **Sky**: gradient from indigo at the top to slate near the horizon. Moon at (95, 55), r≈22, with a glow halo,
  partly covered by two layers of clouds drifting at different speeds.
- **Far distance**: hills around y 175–205 with a tiny village of warm window dots and a church steeple.
  A mist bank fills the bottom of the screen, under the island.
- **Island**: the top surface is an elliptical disc centered at (240, 186), 352×28. The front face is a cut
  through the soil from y≈198, tapering to a jagged point around y≈255. It shows grass roots, clay layers, stones,
  a **buried coffin with a skull** under the graveyard, and roots hanging off the underside.
- **Back left**: a gnarled dead tree at (118, 178) whose branches cross the moon, with a **hanging lantern** that sways.
- **Middle left**: a small graveyard of 4 tombstones and a crooked iron fence, with a crow on one stone.
- **Front left**: a pumpkin patch with vines, and two carved **jack-o'-lanterns**.
- **Back right**: a crooked two-storey house at x 272–362 (chimney top ≈ y 70). It has a glowing ground-floor
  window with a **cat silhouette swishing its tail**, a round attic window where a **shadow walks past**,
  a porch lamp, and jack-o'-lanterns on the steps.
- **Front center**: a **campfire with a bubbling cauldron** and a log seat.
- **Path**: stepping stones from the front edge to the door, with **puddles** along it.
- **Edges**: rainwater runs off the lip in 2 thin **waterfalls** that fade into the mist below.

## Rendering pipeline (each frame)

1. **Sky**: gradient with ordered (Bayer) dithering, then the moon and halo, then tileable-noise clouds
   (two layers, 1 and 2 tiles per loop). A soft sheet-lightning flash twice per loop (turned off for reduced motion).
2. **Far layers**: rendered once at startup; the village lights twinkle slowly.
3. **Island and props**: stored once as per-pixel `(ramp id, base step)`.
   Each frame: `step' = base + floor(light(x,y)·gain + bayer(x,y))` → ramp color. This gives real
   dithered pixel-art light pools rather than smooth gradients.
4. **Lights**: about 10 point lights (fire, windows, lantern, porch lamp, jack-o'-lanterns). Each has a
   precomputed falloff map in its own bounding box and a looping flicker.
   The summed **light buffer** is reused by later steps.
5. **Glowing pixels**: window glass, flame, carved pumpkin faces and the lantern are drawn directly and not lit.
   Fire uses tileable noise scrolling upward, banded white → yellow → orange → red.
6. **Puddles**: mirror the finished scene above, with a rippling x offset and a darker cool tint,
   plus rain ripple rings that expand as ellipses.
7. **Smoke**: from the chimney and the campfire, drawn as dithered blobs that grow, drift with the wind and fade.
   Smoke near the fire picks up warm color.
8. **Sparks**: 1–2 px embers rising in jittery arcs, fading hot core → amber → ember → gone.
9. **Rain**: 3 depth layers (far: short and dim; near: long and bright), slanted by wind. Each streak
   **turns warm where the light buffer is bright**, which is the key warm/cold effect.
   Also splashes on the ground, roof and stones, drips from the eaves, and the waterfalls.
10. **Foreground mist and life**: low drifting fog, 3 bats fluttering past (one crosses the moon), the crow turning its head.
11. **Upscale**: nearest-neighbor to the display canvas.

Performance target: under 4 ms per frame at 480×270. The frame is a `Uint32Array` written through one `ImageData`.

## Files

- `index.html`: the page, the canvas, the scaling code and a minimal HUD. All engine code sits inline in one
  `<script id="engine">` block that doesn't touch the DOM.
  - The HUD hides itself and the cursor after 3 s of no mouse movement. **F** toggles fullscreen and **H** the HUD.
  - Reduced motion: starts paused with a Play button, and lightning is off.
- `render.mjs`: a Node script that loads the engine block from `index.html` and renders the full loop.
  It pipes raw 480×270 RGBA frames into ffmpeg, which scales them up with `flags=neighbor` to 1920×1080.
  Output is H.264 `yuv420p` at CRF ~16. The 4×4 pixel blocks line up with chroma subsampling, so edges stay clean.
- `loop.mp4`: one seamless 120 s loop at 1080p (30 fps by default; 60 fps optional).
- Making a 10-hour file with the soundtrack:
  `ffmpeg -stream_loop 299 -i loop.mp4 -stream_loop 299 -i soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k tenhours.mp4`

## Build steps

Each step is a separate, small edit, so no single reply hits the output limit.

1. Scaffold `index.html`: canvas, scaling, loop clock, HUD, empty engine.
2. Engine helpers: palette and ramps, Bayer matrix, seeded RNG, tileable noise, pixel primitives.
3. Sky, moon, clouds, lightning.
4. Far hills, village, mist bank.
5. Island shape and soil cut (strata, roots, stones, coffin).
6. Tree and lantern, graveyard and fence, pumpkin patch.
7. House: walls, roof, chimney, windows, porch.
8. Campfire, cauldron, log.
9. Lighting system: light maps, flicker, dithered ramp shift.
10. Glowing pixels and window life (cat tail, passing shadow).
11. Rain layers, warm-lit rain, splashes, eave drips, waterfalls.
12. Puddle reflections and ripples.
13. Smoke and sparks.
14. Foreground mist, bats, crow.
15. Check: render a few frames to PNG with Node, look at them once, fix what's off, and run the seam test.
16. Publish the artifact.
17. Write `render.mjs`, render `loop.mp4`, and confirm the first and last frames match.

## Defaults (easy to change)

- Loop length 120 s. Video at 30 fps.
- No text on the image, so you can add titles or a track list in the edit.
- Lightning: two soft distant flashes per loop.

## Soundtrack (added after the first build)

- A small chiptune synth in `<script id="music">`, deterministic and DOM-free like the picture engine.
  - Channels: two pulse waves (melody at 25% duty, arpeggios and a dotted-8th echo at 12.5%),
    a 4-bit stepped triangle (bass and kick) and an LFSR noise channel (snare, hats, thunder).
  - Texture: 4-bit volume steps, a slight tape warble, a quiet rain hiss and vinyl crackle, and a soft low-pass.
- Tune: A minor, 80 BPM, swung 8ths, 40 bars = exactly 120 s.
  - Bars 1–8 intro (Am7 Fmaj7 Dm7 E7), 9–16 verse, 17–24 verse with echo, 25–32 bridge
    (Dm7 G7 Cmaj7 Fmaj7 Bm7b5 E7 Am7 E7), 33–40 outro. The last E7 resolves into the first Am7.
- Thunder rolls in 0.9 s after each on-screen lightning flash (the times come from the engine's `FLASH_TIMES`).
- Seamless: notes that ring past 120 s wrap to the start, and the master filters run twice around the loop.
  The last-to-first sample jump (0.0004) is far below an ordinary sample step (0.015).
- Page: **Sound on** / **Mute** button or the **M** key (browsers need a click before playing sound).
  The music renders in a background worker (about 1 s). While it plays, the picture follows the
  audio clock so they never drift apart.
- Video: `render.mjs` writes `soundtrack.wav` (48 kHz, 16-bit) and muxes it into `loop.mp4` as AAC.
  For the 10-hour file, loop the WAV (sample-exact) instead of the AAC track.

## Status (2026-09-23)

- [x] 1–14: the whole scene, layer by layer (sky, far hills, island, props, house, campfire, lighting,
  glowing elements, rain, puddles, smoke and sparks, bats, crow, fog)
- [x] 15: seam test passes (t=0 and t=T byte-identical). About 2–3 ms per frame at 480×270.
  Checked at 1080p, 1440p, 4K, 1366×768, 800×600 and phone portrait.
- [x] 16: published as an artifact at https://claude.ai/artifact/2jzuxJwyxeoU5XXFRGqx2c
- [x] 17: `loop.mp4` rendered: 1920×1080, 30 fps, 3600 frames, 120 s, H.264, ~59 MB. The last-to-first frame change matches a normal frame step.

Local preview server: `python3 -m http.server 1031 --bind 0.0.0.0` in this folder.

Loop timeline (useful when cutting the video): bats cross at about 27–35 s, 35–47 s, 87–95 s and 106–119 s (the last one passes the moon near 109 s);
sheet lightning at 41 s and 97.5 s; a shadow passes the attic window 4 times per loop.
