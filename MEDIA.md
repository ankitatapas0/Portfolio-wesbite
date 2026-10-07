# Portfolio delivery media

The app imports only `delivery-media/`; originals are not copied into the static
build. All delivery assets and generated metadata are included in this repository,
so a normal checkout can build and run without the original media or encoders.

The complete original `Desktop image assets/` folder is preserved in the Replit
working copy and the original local project. Previously uploaded originals in this
GitHub repository have been kept unchanged. Before running the maintenance
commands below, copy the complete original folder into your checkout; these
commands compare or regenerate delivery assets using the originals.

Regenerate delivery copies with:

```sh
npm run optimize-media
```

Requires FFmpeg (with libx264 and libwebp), ffprobe and ImageMagick. Existing
copies are reused. After replacing a source file, regenerate with
`npm run optimize-media -- --force`.

Verify delivery files with `npm run check-media`.
This checks full durations, unchanged frame rates and aspect ratios, retained
project soundtracks, MP4 faststart metadata, posters, WebP signatures and size
reduction. These commands are maintenance checks, not production build steps;
delivery assets and generated metadata are committed so builds need no encoders.

The script finds delivery imports in `src/pages/DesktopPage.tsx`, maps them to
the corresponding original, and creates:

- Full-length H.264/yuv420p MP4s with the metadata at the beginning (`faststart`).
  Tile loops use a maximum 960px edge and no audio because previews are muted.
  Project videos use a maximum 1920px edge and retain audio, timing and frame rate.
- First-frame WebP posters so resting tiles need not download video data.
- WebP images at quality 85, capped at a 2560px edge without upscaling.
- Generated poster URLs and dimensions for stable layouts before media loads.

To add media, first add a `../../delivery-media/...` import to DesktopPage and
place the matching original in `Desktop image assets/`. For images, append
`.webp` to the original filename (for example `Image1.jpg.webp`). Run the script,
then commit the delivery assets and generated metadata alongside the originals.
Do not put originals in `public/`, which Vite copies wholesale.

Tile videos receive a source only after the existing hover delay or keyboard
focus, and release it when the preview ends or a detail page opens. Project
pages keep the existing first-video playback behavior; other videos receive
their source and poster when within 300px of the detail viewport. Project
images use native lazy loading with their dimensions reserved.
