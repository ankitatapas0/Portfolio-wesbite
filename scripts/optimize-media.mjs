import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const page = readFileSync(path.join(root, "src/pages/DesktopPage.tsx"), "utf8");
const imports = [...page.matchAll(/import (\w+) from "\.\.\/\.\.\/delivery-media\/([^"]+)";/g)];
const force = process.argv.includes("--force");
const refreshNavigation = process.argv.includes("--refresh-navigation");
// Refresh one replaced source without re-encoding every other delivery file.
const refreshAsset = process.argv.find((argument) => argument.startsWith("--refresh="))
  ?.slice("--refresh=".length);
if (refreshAsset && !imports.some(([, , relative]) => relative === refreshAsset)) {
  throw new Error(`Unknown delivery asset to refresh: ${refreshAsset}`);
}
const metadata = [];
const records = [];
const imageRecords = [];
let originalBytes = 0;
let deliveryBytes = 0;

function run(command, args) {
  execFileSync(command, args, { stdio: ["ignore", "pipe", "inherit"] });
}

for (const [, name, relative] of imports) {
  const isVideo = relative.endsWith(".mp4");
  const navigation = relative.startsWith("Navigation/") || relative.endsWith("/Navigation_intro.mp4");
  const refresh = force || relative === refreshAsset || (refreshNavigation && navigation);
  const originalRelative = isVideo ? relative : relative.replace(/\.webp$/, "");
  const input = path.join(root, "Desktop image assets", originalRelative);
  const output = path.join(root, "delivery-media", relative);
  mkdirSync(path.dirname(output), { recursive: true });
  originalBytes += statSync(input).size;
  console.log(`Optimizing ${originalRelative}`);
  if (refresh || !existsSync(output)) {
    const temporary = isVideo ? `${output}.tmp.mp4` : `${output}.tmp.webp`;
    if (isVideo) {
      // Tile loops are always silent; detail videos retain their full soundtrack.
      const tile = relative.startsWith("Desktop images/") || name === "altCtrlYeahYeahYeahsVideo";
      const maxSize = navigation ? 1920 : tile ? 960 : 1920;
      run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-i", input,
        "-map", "0:v:0", ...(tile ? ["-an"] : ["-map", "0:a:0?"]),
        "-vf", `scale=w='min(${maxSize},iw)':h='min(${maxSize},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2${navigation ? ",gradfun=strength=1.2:radius=16" : ""}`,
        "-c:v", "libx264", "-preset", navigation ? "slow" : "medium", "-crf", navigation ? "16" : tile ? "24" : "23",
        ...(navigation ? ["-x264-params", "aq-mode=3:aq-strength=1.2:deblock=-1,-1"] : []),
        "-threads", "4", "-pix_fmt", "yuv420p",
        ...(tile ? [] : ["-c:a", "aac", "-b:a", "160k"]),
        "-movflags", "+faststart", temporary,
      ]);
    } else {
      run("magick", navigation
        ? [input, "-auto-orient", "-define", "webp:lossless=true", "-quality", "100", temporary]
        : [input, "-auto-orient", "-resize", "2560x2560>", "-quality", "85", temporary]);
    }
    renameSync(temporary, output);
  }
  deliveryBytes += statSync(output).size;
  if (!isVideo) {
    const [width, height] = execFileSync("magick", ["identify", "-format", "%w %h", output], { encoding: "utf8" })
      .trim().split(" ").map(Number);
    metadata.push(`import ${name} from ${JSON.stringify(`../delivery-media/${relative}`)};`);
    const variants = [];
    if (navigation) {
      for (const variantWidth of [640, 1280, 1920, 2560].filter((size) => size < width)) {
        const variantRelative = `${relative}.${variantWidth}w.webp`;
        const variantOutput = path.join(root, "delivery-media", variantRelative);
        if (refresh || !existsSync(variantOutput)) {
          const temporary = `${variantOutput}.tmp.webp`;
          run("magick", [input, "-auto-orient", "-resize", `${variantWidth}x>`,
            "-define", "webp:lossless=true", "-quality", "100", temporary]);
          renameSync(temporary, variantOutput);
        }
        deliveryBytes += statSync(variantOutput).size;
        const variantName = `${name}_${variantWidth}`;
        metadata.push(`import ${variantName} from ${JSON.stringify(`../delivery-media/${variantRelative}`)};`);
        variants.push(`${variantName} + " ${variantWidth}w"`);
      }
    }
    const srcSet = variants.length
      ? `, srcSet: [${[...variants, `${name} + " ${width}w"`].join(", ")}].join(", ")`
      : "";
    imageRecords.push(`  [${name}]: { width: ${width}, height: ${height}${srcSet} },`);
    continue;
  }
  const probe = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
    "-of", "json", output,
  ], { encoding: "utf8" })).streams[0];
  const poster = `${output}.poster.webp`;
  // The navigation tile rests on frame 10 (zero-based frame index 9).
  const posterFrame = relative === "Desktop images/Navigation_intro.mp4" ? 9 : 0;
  if (refresh || !existsSync(poster) || posterFrame > 0) {
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-frames:v", "1", "-vf", `select='eq(n,${posterFrame})',scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease`,
      "-c:v", "libwebp", ...(navigation ? ["-lossless", "1"] : ["-quality", "85"]), "-threads", "2", poster,
    ]);
  }
  deliveryBytes += statSync(poster).size;
  metadata.push(
    `import ${name} from ${JSON.stringify(`../delivery-media/${relative}`)};`,
    `import ${name}Poster from ${JSON.stringify(`../delivery-media/${relative}.poster.webp`)};`,
  );
  records.push(`  [${name}]: { poster: ${name}Poster, width: ${probe.width}, height: ${probe.height} },`);
}

writeFileSync(path.join(root, "src/video-metadata.generated.ts"), [
  "// Generated by scripts/optimize-media.mjs. Do not edit by hand.",
  ...metadata,
  "",
  "export const videoMetadata: Record<string, { poster: string; width: number; height: number }> = {",
  ...records,
  "};",
  "",
  "export const imageMetadata: Record<string, { width: number; height: number; srcSet?: string }> = {",
  ...imageRecords,
  "};",
  "",
].join("\n"));
console.log(`Referenced originals: ${(originalBytes / 1e6).toFixed(1)} MB`);
console.log(`Delivery copies including posters: ${(deliveryBytes / 1e6).toFixed(1)} MB`);
console.log(`Reduction: ${(100 * (1 - deliveryBytes / originalBytes)).toFixed(1)}%`);
