# Detail glass renderer verification

## Measurements

Measured with headless Chromium 152, ANGLE/SwiftShader, a 1280×900 viewport,
DPR 2, against the development preview. These are rendering-work counts,
**not hardware frame-rate measurements**. The unchanged delivery H.264 Opera
video decoded and played in this browser (`readyState = 4`, `paused = false`).

Each sample below lasts two seconds. The static/scroll samples use Getty
with videos paused; the video sample uses the first Opera video intersecting
the capture strip. Baseline measurements preceded renderer changes.

| Scenario | Renderer | Draws | Texture allocations | Texture updates | Media bound reads | Media style reads | Media discoveries |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Static | Before | 58 | 58 | 0 | 696 | 58 | 58 |
| Static | After | 0 | 0 | 0 | 0 | 0 | 0 |
| Scrolling | Before | 57 | 57 | 0 | 684 | 57 | 57 |
| Scrolling | After | 67 | 0 | 67 | 12 | 12 | 0 |
| Playing video | Before | 43 | 43 | 0 | 129 | 86 | 43 |
| Playing video | After | 38 | 0 | 38 | 0 | 0 | 0 |
| Paused video | Before | 54 | 54 | 0 | 162 | 108 | 54 |
| Paused video | After | 0 | 0 | 0 | 0 | 0 | 0 |
| Closed | Before / After | 0 | 0 | 0 | 0 | 0 | 0 |

Draw counts during motion vary with browser scheduling and the software GPU.
The scrolling sample can complete more draws with less per-draw work; this
does not establish a visitor-device FPS improvement. A geometry/style
invalidation occurred during scrolling, but it did not require rediscovering
media or allocating textures.

Texture storage is now allocated only on initialization or backing-size changes.
At DPR ≥2, a 1.5x backing-scale cap uses 43.75% fewer pixels than the previous
2x cap. The shader, 70px band, 140px capture strip, 30px feather, and 16
chromatic samples are unchanged.

## Focused checks

- Actual delivery video playback updated the glass via decoded-frame callbacks.
- Pausing stopped all redraws; seeking a paused video changed the rendered
  pixel signature. Theme changes changed it again. GPU error checks returned 0.
- A browser without video-frame callbacks was simulated by temporarily removing
  that API in the test page. Its fallback updated a playing video nine times in
  500ms without allocations/layout reads; pausing removed the polling timer.
- A hidden-tab visibility event was simulated while video was playing. It
  canceled the pending video callback and left no rendering RAF or timer.
  Restoring visibility resumed updates.
- Backing sizes at DPR 1 / 1.25 / 2 / 3 were 1280×70 / 1600×88 /
  1920×105 / 1920×105. CDP's DPR override was paired with a resize event,
  since this emulation does not dispatch real screen/zoom resize events.
- At 390×844 and DPR 3, the band remained full-width and 70 CSS pixels tall,
  with a 585×105 backing surface. Desktop and mobile screenshots showed
  colored distortion over the Getty images. Pixel readback confirmed opaque
  lower-edge alpha (255) and transparent upper-edge alpha (0).
- Rapid Getty→Opera switches and three repeated open/switch/Escape-close cycles
  left **zero** renderer RAFs, video callbacks, timers, observers, event
  listeners, and tracked textures/buffers/programs/shaders after cleanup.
- The ordinary interaction-test browser confirmed images, fullscreen controls,
  theme switching, navigation, and responsive layout. That browser lacked both
  WebGL and H.264, so its missing glass/playback was not used as renderer
  evidence. The codec/WebGL-capable Chromium above supplied that evidence.
- Portfolio TypeScript checking and the production Vite build passed.

Project media is a scrollable stream, not a previous/next carousel. Changing
media nodes, loading images, and changing layout invalidate the capture.
Opening/closing transforms are sampled only while the backdrop's animations
are running, with a final geometry refresh when they finish.

## Reproducing the measurements

The check script is development-only and is not imported by the application.
Start the portfolio's managed development workflow, then launch a separate
local Chromium instance:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9222 --user-data-dir=/tmp/glass-chromium about:blank
```

In another terminal:

```sh
node artifacts/portfolio/scripts/check-glass.mjs http://localhost:80 optimized
pnpm --filter @workspace/portfolio typecheck
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/portfolio build
```

The script writes counts and screenshots under `/tmp/glass-optimized*`,
asserts idle/video/visibility/fallback/DPR/seek/theme/cleanup behavior, and
changes no delivery assets. Browser instrumentation exists only in the test
page. Close that separate Chromium instance when finished.

## WebKit and Firefox regression checks

The development-only Playwright suite in `scripts/glass/` complements
`scripts/check-glass.mjs`; it does not replace the Chromium before/after
measurements above. Run it against the managed portfolio workflow:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install webkit firefox
GLASS_BASE_URL=http://localhost:80/ \
  pnpm --filter @workspace/portfolio check-glass:browsers
```

Use a **macOS host** with working WebGL and system H.264 decoding. Linux
requires Playwright's native browser dependencies and suitable media/GPU
libraries; downloading the browser binaries alone is insufficient. Do not
change delivery MP4s, intercept media, or substitute WebM to get a green result.
The suite records browser version/user agent, GPU renderer, DPR, H.264
`canPlayType`, and video-frame API support. Missing WebGL or H.264 is a
**failure**, never a skipped/passing renderer check. Actual delivery playback
must advance `currentTime` and frame counts (where available), not merely
advertise a codec.

`.github/workflows/glass-browsers.yml` runs separate WebKit and Firefox jobs
on macOS for portfolio/media changes and manual dispatch. It starts the
unchanged Vite development source, because test-page resource tracking uses
renderer source URLs in engine stack traces. It uploads the HTML report,
JSON attachments, PNG snapshots and failure traces, even on failure. The
tests assert that the probe actually sees renderer observers before checking
cleanup, preventing a source-stack mismatch from producing a false pass.

### Coverage and evidence

Each engine runs seven cases:

- Getty imagery crossing the glass, static idle, continuous scrolling,
  simulated live DPR changes, and three complete open/Escape-close cycles.
- Actual Opera MP4 playback through decoded-frame callbacks when available.
  When an engine lacks that API, the same case explicitly reports polling.
- A separate fresh page with the video-frame API disabled **before renderer
  creation**, testing the polling fallback with the same delivery MP4.
- Genuine initial DPR 1, 1.25, 2, and 3 browser contexts. The DPR 3 case uses
  a 390×844 viewport and checks full-width mobile coverage.

Video cases assert nonzero draw/upload work during playback, no steady-state
texture allocations, media-bound reads or discoveries, stopped work after
pause, changed pixels after a paused seek, suspension while hidden, resumed
updates, and zero tracked callbacks/timers/observers/listeners/GPU objects
after closing. Getty cases assert scrolling updates without new texture
allocations or media discovery, backing sizes capped at 1.5x, **70 CSS pixels**
of band height, colored pixels in the band, zero WebGL errors, opaque bottom
alpha and feathered top alpha. All media and shipped renderer code remain
untouched.

Visibility suspension/resume uses a **synthetic `document.hidden` plus
`visibilitychange`** in each engine. Portable Playwright APIs cannot reliably
OS-background a headless tab. Live DPR changes similarly override the
page's DPR and dispatch resize; they are labeled simulations in the JSON.
Separate contexts test real initial DPR values. Neither simulation proves
OS tab throttling or moving a window between physical displays.

Every Getty case saves a full composition and a 140 CSS pixel screenshot strip
containing the undistorted image just above the unchanged 70px glass band,
plus geometry/pixel readback JSON. These are visual inspection snapshots,
**not approved golden-image comparisons**: shader output, antialiasing and
fonts differ between GPUs/engines. Automatic regression assertions cover
coverage, color, feathering and GL errors. When inspecting the report, confirm
that the image remains recognizable through the distortion, there is no
blank/solid-color strip, the top feather is continuous, and desktop/mobile
edges cover the viewport without seams. Do not approve a new baseline merely
because a new screenshot exists.

```sh
pnpm exec playwright show-report artifacts/portfolio/test-results/glass-report
# Optional local software-GPU smoke validation of the same suite:
GLASS_CHROMIUM=/repl/tools/bin/chromium \
  pnpm --filter @workspace/portfolio check-glass:browsers --project=chromium-smoke
```

### Work counts versus real-device frame rate

Each `rendering-work` JSON attachment labels its data as **rendering-work
counts** and records the sample window (800ms, or 1200ms for playing video).
Pixel readback is disabled during those samples. Counts describe calls and
resource lifetime; dividing draws by time does **not** establish hardware FPS.
No real-device frame rate is reported by this suite.

Before a browser release sign-off, use released Safari on a Mac/iPhone and
Firefox on a hardware-GPU computer with the unchanged media. Record OS,
browser version, device/GPU, display refresh rate, viewport/DPR, power mode
and exact project/scroll position. Play the Opera video, switch to another
tab/app for 10 seconds, return, and verify decoding and glass updates resume
without a blank band or stuck frame. Scroll Getty, move the window between
displays or change browser zoom, and repeat opening/closing. Capture Getty
desktop/mobile band snapshots. Measure presented/dropped frames and frame
timings using the browser's performance tools in a separate, **uninstrumented**
session; report that hardware result separately from automated work counts.
Playwright WebKit is Safari's engine, **not the released Safari application**.

### Verification status

The suite was exercised locally with the existing codec/WebGL-capable
Chromium/SwiftShader; this is runner smoke evidence only, not a WebKit/Firefox
pass or a real-device FPS result. The container's downloaded WebKit/Firefox
builds lack their native host libraries and cannot launch. The macOS CI jobs
are the reproducible cross-engine verification path; no macOS CI pass or
released-Safari sign-off is claimed from this container.
