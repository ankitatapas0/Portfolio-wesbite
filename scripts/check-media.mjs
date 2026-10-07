import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { openSync, closeSync, readSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const page = readFileSync(path.join(root, "src/pages/DesktopPage.tsx"), "utf8");
const imports = [...page.matchAll(/import (\w+) from "\.\.\/\.\.\/delivery-media\/([^"]+)";/g)];
assert(imports.length > 0, "No delivery assets found");

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
for (const [, name, relative] of imports) {
  const file = path.join(root, "delivery-media", relative);
  const isVideo = relative.endsWith(".mp4");
  const original = path.join(root, "Desktop image assets", isVideo ? relative : relative.replace(/\.webp$/, ""));
  originalBytes += statSync(original).size;
  deliveryBytes += statSync(file).size;
  if (!isVideo) {
    const header = readFileSync(file).subarray(0, 12);
    assert.equal(header.toString("ascii", 8, 12), "WEBP", `${relative} is not WebP`);
    images++;
    continue;
  }
  const before = probe(original);
  const after = probe(file);
  const video = after.streams.find((stream) => stream.codec_type === "video");
  const originalVideo = before.streams.find((stream) => stream.codec_type === "video");
  const tile = relative.startsWith("Desktop images/") || name === "altCtrlYeahYeahYeahsVideo";
  assert.equal(video.codec_name, "h264");
  assert.equal(video.pix_fmt, "yuv420p");
  assert(video.width <= (tile ? 960 : 1920) && video.height <= (tile ? 960 : 1920));
  assert(Math.abs(Number(after.format.duration) - Number(before.format.duration)) < 0.15, `Video was trimmed: ${relative}`);
  assert.equal(video.avg_frame_rate, originalVideo.avg_frame_rate, `Frame rate changed: ${relative}`);
  assert(Math.abs(video.width / video.height - originalVideo.width / originalVideo.height) < 0.01, `Aspect ratio changed: ${relative}`);
  if (!tile && before.streams.some((stream) => stream.codec_type === "audio")) {
    assert(after.streams.some((stream) => stream.codec_type === "audio"), `Soundtrack missing: ${relative}`);
  }
  assertFastStart(file);
  assert(statSync(`${file}.poster.webp`).size > 0, `Poster missing: ${relative}`);
  deliveryBytes += statSync(`${file}.poster.webp`).size;
  videos++;
}
assert(deliveryBytes < originalBytes, "Delivery media is not smaller than originals");
assert(!readFileSync(path.join(root, "src/components/MediaSlot.tsx"), "utf8").includes('preload="auto"'));
console.log(`Verified ${videos} full-length, faststart videos with posters and ${images} WebP images.`);
console.log(`Delivery: ${(deliveryBytes / 1e6).toFixed(1)} MB; originals: ${(originalBytes / 1e6).toFixed(1)} MB.`);
