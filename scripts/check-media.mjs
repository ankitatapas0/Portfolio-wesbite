import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { openSync, closeSync, readSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceDigest } from "./media-cache.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const page = readFileSync(path.join(root, "src/pages/DesktopPage.tsx"), "utf8");
const imports = [...page.matchAll(/import (\w+) from "\.\.\/\.\.\/delivery-media\/([^"]+)";/g)];
assert(imports.length > 0, "No delivery assets found");
const cache = JSON.parse(readFileSync(path.join(root, "media-cache.generated.json"), "utf8"));
const metadata = readFileSync(path.join(root, "src/video-metadata.generated.ts"), "utf8");

function imageDimensions(file) {
  const header = readFileSync(file).subarray(0, 12);
  assert.equal(header.toString("ascii", 8, 12), "WEBP", `${file} is not WebP`);
  return execFileSync("magick", ["identify", "-format", "%w %h", file], { encoding: "utf8" })
    .trim().split(" ").map(Number);
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", file,
  ], { encoding: "utf8" }));
}

function assertFastStart(file) {
  const fd = openSync(file, "r");
  const header = Buffer.alloc(16);
  const atoms = [];
  try {
    for (let offset = 0; offset < statSync(file).size;) {
      assert.equal(readSync(fd, header, 0, 8, offset), 8);
      let size = header.readUInt32BE(0);
      atoms.push(header.toString("ascii", 4, 8));
      if (size === 1) {
        readSync(fd, header, 8, 8, offset + 8);
        size = Number(header.readBigUInt64BE(8));
      }
      if (size === 0) break;
      assert(size >= 8, `Invalid MP4 atom in ${file}`);
      offset += size;
    }
  } finally {
    closeSync(fd);
  }
  assert(atoms.indexOf("moov") >= 0, `Missing metadata in ${file}`);
  assert(atoms.indexOf("moov") < atoms.indexOf("mdat"), `Not faststart: ${file}`);
}

let originalBytes = 0;
let deliveryBytes = 0;
let videos = 0;
let images = 0;
let variants = 0;
for (const [, name, relative] of imports) {
  const file = path.join(root, "delivery-media", relative);
  const isVideo = relative.endsWith(".mp4");
  const original = path.join(root, "Desktop image assets", isVideo ? relative : relative.replace(/\.webp$/, ""));
  const record = cache.assets[relative];
  assert.equal(record?.sourceSha256, sourceDigest(original), `Source changed; run optimize-media: ${relative}`);
  assert(record.outputs[relative], `Missing cache record: ${relative}`);
  originalBytes += statSync(original).size;
  deliveryBytes += statSync(file).size;
  if (!isVideo) {
    const [width, height] = imageDimensions(file);
    assert(metadata.includes(`[${name}]: { width: ${width}, height: ${height}`), `Stale image dimensions: ${relative}`);
    if (relative.startsWith("Navigation/")) {
      for (const variantWidth of [640, 1280, 1920, 2560].filter((size) => size < width)) {
        const variantRelative = `${relative}.${variantWidth}w.webp`;
        const variant = path.join(root, "delivery-media", variantRelative);
        assert(record.outputs[variantRelative], `Missing variant cache record: ${variantRelative}`);
        const [actualWidth, actualHeight] = imageDimensions(variant);
        assert.equal(actualWidth, variantWidth, `Wrong responsive width: ${variantRelative}`);
        assert(Math.abs(actualWidth / actualHeight - width / height) < 0.01, `Variant aspect ratio changed: ${variantRelative}`);
        assert(metadata.includes(`../delivery-media/${variantRelative}`), `Missing responsive metadata: ${variantRelative}`);
        deliveryBytes += statSync(variant).size;
        variants++;
      }
      if (width > 640) {
        assert(metadata.includes(`${name} + " ${width}w"`), `Full-resolution candidate missing: ${relative}`);
      }
    }
    images++;
    continue;
  }
  const before = probe(original);
  const after = probe(file);
  const video = after.streams.find((stream) => stream.codec_type === "video");
  const originalVideo = before.streams.find((stream) => stream.codec_type === "video");
  const tile = relative.startsWith("Desktop images/") || name === "altCtrlYeahYeahYeahsVideo";
  const preservesTileAudio = name === "huluUpHereVideo";
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  const maxSize = relative.endsWith("/Navigation_intro.mp4") ? 1920 : tile ? 960 : 1920;
  assert(video.width <= maxSize && video.height <= maxSize);
  assert(Math.abs(Number(after.format.duration) - Number(before.format.duration)) < 0.15, `Video was trimmed: ${relative}`);
  assert.equal(video.avg_frame_rate, originalVideo.avg_frame_rate, `Frame rate changed: ${relative}`);
  assert(Math.abs(video.width / video.height - originalVideo.width / originalVideo.height) < 0.01, `Aspect ratio changed: ${relative}`);
  if ((!tile || preservesTileAudio) && before.streams.some((stream) => stream.codec_type === "audio")) {
    assert(after.streams.some((stream) => stream.codec_type === "audio"), `Soundtrack missing: ${relative}`);
  }
  if (tile && !preservesTileAudio) {
    assert(!after.streams.some((stream) => stream.codec_type === "audio"), `Tile is not silent: ${relative}`);
  }
  assertFastStart(file);
  assert(statSync(`${file}.poster.webp`).size > 0, `Poster missing: ${relative}`);
  imageDimensions(`${file}.poster.webp`);
  assert(record.outputs[`${relative}.poster.webp`], `Missing poster cache record: ${relative}`);
  assert(metadata.includes(`[${name}]: { poster: ${name}Poster, width: ${video.width}, height: ${video.height}`), `Stale video dimensions: ${relative}`);
  deliveryBytes += statSync(`${file}.poster.webp`).size;
  for (const match of page.matchAll(/source:\s*(\w+),\s*type:\s*"video",\s*initialTime:\s*([\d.]+)/g)) {
    if (match[1] !== name || Number(match[2]) <= 0) continue;
    const time = Number(match[2]);
    const relativePoster = `${relative}.poster-${time}.webp`;
    const restPoster = path.join(root, "delivery-media", relativePoster);
    assert(statSync(restPoster).size > 0, `Resting frame missing: ${relativePoster}`);
    imageDimensions(restPoster);
    assert(record.outputs[relativePoster], `Missing resting-frame cache record: ${relativePoster}`);
    assert(metadata.includes(`../delivery-media/${relativePoster}`), `Missing resting-frame metadata: ${relativePoster}`);
    deliveryBytes += statSync(restPoster).size;
  }
  videos++;
}
assert(deliveryBytes < originalBytes, "Delivery media is not smaller than originals");
const player = readFileSync(path.join(root, "src/components/MediaSlot.tsx"), "utf8");
const loading = readFileSync(path.join(root, "src/components/useDetailVideoLoading.ts"), "utf8");
assert(player.includes("preload={loading.preload}"), "Detail player must use its bounded loading policy");
assert(loading.includes("sourceReady && (nearViewport || playbackRequested)"), "Detail buffering must remain gated by viewport interest or requested playback");
assert(loading.includes('playbackRequested ? "auto" as const : "metadata" as const'), "Idle details must not compete with requested playback");
assert(!player.includes("video.currentTime = initialTime"), "Resting frames must use posters rather than movie seeks");
console.log(`Verified ${videos} full-length, faststart videos with posters, ${images} WebP images and ${variants} responsive variants.`);
console.log(`Delivery: ${(deliveryBytes / 1e6).toFixed(1)} MB; originals: ${(originalBytes / 1e6).toFixed(1)} MB.`);
