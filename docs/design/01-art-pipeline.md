# 01 — Art pipeline & curated-parametric component library

**Stance: curated-parametric.** Humans author silhouette grids, OKLCH palette anchors, L-system grammar knobs, and animation curves as JSON; the machine only *assembles / recolors / animates within those rails* — never "seed-from-nothing". Charm lives in the human-tuned components; the seed only varies choices within authored bounds, so output can't drift into ugly noise. **All art is baked at build time** to committed PNG atlases — no runtime generation, and correctness never depends on a runtime shader.

> **Audit corrections threaded below ([08](08-reference-audit.md)).** **Renderer (VH-2):** PixiJS v8 has *no* WebGL→Canvas2D auto-fallback — primary `WebGLRenderer` + an opt-in **reduced mode** (`pixi.js ≥8.16` experimental canvas) selected after a `gl===null` probe; the `recolor.ts` Canvas path is either a full manual `SpriteScene` draw or a declared **no-recolor** mode leaning on Q6's non-colour channels (VH-7). **Tiles (VH-10):** the 16-tile set is **per ordered terrain pair**; the 4-biome world is a **stack of binary dual-grids** drawn back-to-front by fixed biome priority so 3-way junctions resolve deterministically. **Determinism (VH-11):** `cbrt/pow/sin/cos` are impl-defined across engines, so the bake **pins the Bun version**, **quantizes/rounds colour math before raster** (committed integer sRGB-linear LUT), treats the committed PNGs as source of truth (strict canary on the pinned toolchain + a non-blocking cross-version job). **Silhouette variety (VH-12):** at bake time `templateIdx` selects a *grammar* and the per-entry seed varies `branchAngle`/`iterations`/`leafShape` within it — but **only for non-RT zones** (Grove/Almanac); Bench/Meadow sprites stay complexity-matched (VH-9). **Bundle (VH-6):** pixi adds ~120 KB gzip → budget ≤200 KB gzip + CI size-gate + lazy-load after first paint.

## Build-time bakery

`scripts/bake-atlas.ts` (run via `bun gen:art`, mirrors `gen-icons.ts`) orchestrates pure sub-modules under `scripts/bake/`, each a pure fn returning RGBA `Uint8ClampedArray` frames + frame-meta (zero DOM, zero PixiJS). The whole bake is a **pure function of `(BUILD_SEED, curated art-src JSON, dict-no.json)`**.

Generation order (dependency-driven, fixed for determinism):
1. `palette.ts` — build the master OKLCH ramp set first (everything samples it).
2. `tiles.ts` — terrain + reclamation overlays.
3. `lsystem.ts` — plant growth-stage frames.
4. `creature.ts` — species (depends on palette + shared micro-parts).
5. `pack.ts` — bin-pack into a small fixed number of atlases grouped by usage (`atlas-{tiles,plants,creatures,fx}.png`) so the runtime binds **≤4 textures**.
6. `manifest.ts` — SHA-256 per PNG + a combined digest → `public/art/atlas-manifest.json`.

Determinism backbone: reuse `rng.ts` via `setRng(seededRng(\`bake:${assetKey}\`))` around each asset and `resetRng()` after, so cross-asset order can change without altering any single asset's pixels. `raster.ts` is a **dependency-free headless framebuffer** (not browser Canvas2D) so it runs in plain Bun without happy-dom — sidestepping the documented Bun-Worker+happy-dom segfault. Final encode reuses `sharp` exactly like `gen-icons.ts`: `sharp(buffer, {raw:{width,height,channels:4}}).png().toFile(...)`.

### Golden-hash test gate

`manifest.json = { seed, builtAt:'<excluded-from-hash>', atlases:[{file,sha256,frames}], digest }`; the digest excludes timestamps so it is byte-stable. `test/bake-atlas.test.ts`: (a) regenerates a small canary subset (one tile config, one plant stage, one species) in-process and asserts the RGBA buffers byte-match committed golden buffers (fast, no sharp); (b) asserts `manifest.digest === EXPECTED_DIGEST`. CI fails if a code change perturbs pixels without re-baking + re-committing — same "generate offline, commit artifact" contract as the synth-WAV + icon pipelines. Contributor workflow: `bun gen:art && git add public/art`, plus a CI clean-tree check after re-bake.

## OKLCH solarpunk palette (`palette.ts`)

`sRGB↔OKLCH` via Ottosson's exact matrices, committed as constants (no dependency). `srgbToLinear`: `c≤0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`. Linear→OKLab uses the standard `M1`/`M2` matrices + cube-root; OKLab→linear the published inverse + cube + `linearToSrgb` + clamp.

**Ramp algorithm** `rampFromAnchor(baseHue, baseChroma, steps=N)`: for step `i`, `t=i/(N-1)`;
- `L_i = lerp(0.30, 0.92, ease(t))` (shadow → highlight)
- `C_i = baseChroma * bell(t)` — chroma peaks mid-ramp, drops at the deepest shadow + brightest highlight to avoid neon/muddy ends
- `H_i = baseHue + HUE_SHIFT*(t-0.5)*2`, `HUE_SHIFT ≈ 18°` toward warm gold (~55°) at highlights, toward cool teal (~195°) at shadows — the **warm-light / cool-shadow** rule.

**Cohesion:** all anchors come from a curated harmonic set in `palette-anchors.json` (foliage green H≈140–160, gold/brass H≈70–90, teal/solar-glass H≈190–210); the seeded rng only *jitters* each anchor ±6° hue / ±8% chroma within those bands → variety without drift, always green/gold/teal.

**Season + day-night do NOT re-bake** — they are `5×4 ColorMatrix` coefficients (or a 256-px gradient-map LUT) derived once from the master ramp's endpoints (autumn = rotate foliage hue +30° toward gold; night = lower L + chroma, hue toward teal), applied at runtime. The same ramp underlies the bake recolor *and* the runtime LUT, so baked sprites and live tint always agree.

> **Per-entry colour (Q2, corrected by audit VH-3 → [08](08-reference-audit.md)).** Templates bake as luminance/shade-index masks. Per-entry colour is applied as **`sprite.tint`** (in-batch, near-free) for the dominant hue, or the full `rampFromAnchor(entry.baseHue, entry.baseChroma)` ramp baked **once into a cached `RenderTexture`** during the frozen pre-onset build (then drawn as a plain batched sprite). It is **never** a live per-sprite `ColorMatrixFilter` — N live filters break batching + ping-pong framebuffers. **Season/day-night is the *only* `ColorMatrixFilter`**, applied once to one scene container. So 60 templates render ~20,592 distinct species without per-entry baked frames *and* without per-sprite filters.

## Pixel L-system plants (`lsystem.ts`)

Parametric bracketed L-system. Axiom `X`; curated rules per archetype in `lsystem-grammars.json` (e.g. `X→F[+X][-X]FX`, `F→FF`). The curated **knob set** (only these vary by seed, within authored bounds): `branchAngle` (18–32°), `iterations` (3–6), `internodeLen`, `leafShape` (oval|lance|round|fan curated stamps), `leafSize`, `flowerType` (none|star|bell|disc), `flowerColorAnchorId`, `phyllotaxy` (alternate|opposite), `taper`. Turtle interpretation rasterizes onto `raster.ts`: `F`=internode line, `+/-`=yaw (±3° bake-rng jitter per node), `[ ]`=push/pop; leaf/flower symbols stamp a curated micro-sprite. Trunk uses the dark end of the foliage ramp, leaves the mid, flower a gold/teal accent.

**`N=6` growth-stage frames** keyed to `stabilityToStage(card.s)` (the canonical map in `src/world/presentation-map.ts`): `dormant` (grey, s<0.5) → `sprout` (s<3) → `juvenile` (s<7) → `young` (s<14) → `mature` (s<30) → `wild/flowering` (s≥30, `isMastered`). Each stage runs the *same seed's* L-system at a smaller iteration count + saturation; dormant uses a fully-desaturated ramp (= the greyed valley). Regreening is literally the FSRS stability climbing the baked frames. Seasonal recolor = runtime LUT only (leaves never re-baked). Wind sway is a **runtime** transform (not baked) to avoid frame-count explosion.

## Silhouette-first creatures (`creature.ts`)

Reads cozy, not "generated", via four curated constraints:
1. **Curated part library** (`creature-parts.json`): hand-authored pixel stamps + anchor sockets for bodies (round|teardrop|loaf), heads (none|small|domed), wings (none|leaf|moth|gossamer), tails, legs (0/2/4/6), ears/antennae. The machine only *picks + places* from this set — it cannot draw novel limbs, so silhouettes always read as deliberate.
2. **Silhouette grid first** — build a low-res boolean mask (~24×24) by stamping chosen parts at sockets, then **vertical-mirror** the left half (left-right symmetry = the biggest "designed animal" cue).
3. **Outline** — 1px `selout` (outline colour from the deep end of the body ramp, not pure black).
4. **Ramp shading + 4×4 Bayer dither** — 4–5-step OKLCH body ramp, top-left light; transition bands dithered so gradients read as hand-placed clusters, not noise.

Deterministic `speciesSeed = hashString(entryId)` → a *local* bake rng drives part picks, ramp anchor (constrained to solarpunk bands), eye style, pattern. The word's pos/definition biases choices (verb → wings; noun → grounded) so the visual trait mirrors the meaning. Dormant (grey) + awake (colour) frames; typing the name flips dormant→awake at runtime via a frame swap.

> **Bench specimens are a separate set** (`bench-specimens.ts`): the cozy creature mirror-symmetry trick would make `mirrorV` undetectable. Bench plants are chiral and asymmetric, keyed by chess role (q/r/b/n/p × w/b ramp), so both `mirrorV` and `mirrorH` are visually detectable.

## Tiles & world (`tiles.ts`)

- **Dual-grid 16-tile autotiling** — the display grid is offset −½ tile so each display tile's 4 corners sample 4 world-cell centres; the 4 boolean corner bits index a 16-entry tile set baked per terrain transition. Simpler and byte-stabler than the 47-blob set.
- **Value-noise biomes** — a seeded mulberry32 lattice + bilinear smoothing (dependency-free, deterministic) thresholded into solarpunk bands (meadow / grove / wetland-teal / solar-clearing); the biome selects which terrain pair feeds the dual-grid.
- **Art-Nouveau reclamation overlay** — a first-class generator *stage* run after base tiles: for each geometric "solar-tech skeleton" template (authored in `tile-templates.json`), overlay a constrained 2D L-system / random-walk creeper (vine/moss) in the foliage ramp creeping from edges inward; moss = Bayer-dithered green stipple in concave corners. A coverage knob bakes the same tech tile at levels 0–4 (bare → overgrown), so world regreening reuses these like plant growth stages.

Frame keys: `tile:<terrainPair>:<corners0-15>`, `reclaim:<template>:<coverage0-4>`.

## Runtime art layer (`src/scene/` + `src/art/`)

PixiJS v8 behind the `block.ts` seam — blocks emit semantic events; the art layer only selects baked frames. Modules:
- `pixi-stage.ts` — `PIXI.Application` with feature-detected **WebGL2→WebGL1→Canvas2D**; `scaleMode='nearest'` + `roundPixels=true` for crisp pixels; dpr cap + integer scaling for low-end Android.
- `atlas.ts` — loads committed atlases + frame-maps; `frame(name)→Texture`.
- `recolor.ts` — season/day-night `ColorMatrixFilter` from `palette.ts` coefficients; **Canvas2D fallback** = a single `globalCompositeOperation` composite-tint pass.
- `tween.ts` — hand-rolled rAF tween: lerp + easing, awaken squash-stretch, idle-sway (sinusoidal skew), plant wind (vertical-gradient shear). Transform-only, no re-raster. Honors the freeze flag.
- `particles.ts` — object-pooled emitters (pollen / fireflies / leaves / sparkle), hard caps (≈40/24/20/12), **disabled on the Canvas2D path**, zero per-frame alloc.
- `cosmetic-rng.ts` — holds the partitioned `mulberry32(hashString('cosmetic:'+trialSeed))` instance; never touches the gameplay/daily stream (guardrail 6).
- The single `frozen` flag (owned by `trial-clock.ts`; see [03](03-zone-mechanics.md)) — while a stimulus is shown and RT unlogged, `tween`/`particles`/filter mutation early-return (guardrail 1).

**Perf budget (low-end Android WebView):** ≤4 atlas textures (1–2 bound/scene → batches in ≤2 draw calls); ~150 visible sprites with culling; pooled particle caps; filters are progressive enhancement only. Correctness never depends on a shader. Degradation order under load: particles thin first, then sway, then filters — gameplay frames last.

## Curated-parametric workflow & fallback ladder

Human-authored in `art-src/`: silhouette stamps + sockets, palette anchors + `Lshadow`/`Lhighlight`/`HUE_SHIFT`, L-system grammars + knob bounds, tile templates + reclamation motifs, animation curves. The seed varies only *which* parts/grammar/anchor are chosen + bounded jitter.

If a hero species underwhelms: (1) tighten knob bounds / add curated part variants (cheapest, stays parametric); (2) author a hand-pixeled `art-src/overrides/<entryId>.png` blitted verbatim by `creature.ts` (the pipeline already blits stamps, so an override is just a 1-part assembly — still flows through the committed-atlas hash gate); (3) worst case, ship `N` curated hero sprites and let the generator fill the long tail. All three preserve byte-determinism.

## Resolved (see [06](06-resolved-decisions.md))

- **Frame-count budget (Q2)** — never bake per-entry frames. Bake **60 kingdom-partitioned body-plan templates** (FLORA 24 / FAUNA 16 / MODIFIER 12 / STRUCTURE 8, ~326 frames) as **luminance/shade-index masks** (not final RGB); `templateIdx = bodyPlanHash mod N[kingdom]`. Per-entry identity is three runtime layers over the shared template — palette (the per-entry OKLCH ramp via the same LUT path as seasons), 0–2 curated accessory micro-parts pre-composited once in the frozen build, and a seeded pattern overlay. Dormant = stage 0 under a desaturated LUT; awake = the saturated LUT at `stabilityToStage(card.s)`. Fits in a fraction of one **2048px** atlas, ≤4 textures.
- **Canvas2D fidelity (Q3)** — one full-frame `globalCompositeOperation` tint per time-of-day (`multiply`/`screen`/`source-atop` + `globalAlpha` only; a feature probe upgrades when richer modes exist). `recolor.ts` gains `applyTint(ctx, w, h, tint)`. Verified machine-distinguishable: monotonic mean-luminance noon>evening>night + warm-bias(evening,autumn)>noon. The manual repaint loop shares the *one* `frozen` flag + *one* arming rAF so onset stays paint-anchored (`trial-clock` gains `renderMode`).

## Still open

- Confirm "dormant-grey" reads as *asleep* not *broken* (maybe a cool-teal tint + low alpha rather than pure greyscale).
- Wind sway as runtime shear vs baked flutter frames — visual spike to decide per-archetype (shear can look rubbery on tall trees).
- Override PNGs reintroduce hand-drawn assets — acceptable escape hatch, must stay rare, still hashed.
