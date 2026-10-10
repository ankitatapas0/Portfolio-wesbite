import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openMediaCache, writeAtomic } from "./media-cache.mjs";

const originalMediaExtensions = new Set([
  ".avif", ".gif", ".jpeg", ".jpg", ".mov", ".mp4", ".png", ".webm", ".webp",
]);
const hashedDeliveryMediaPattern =
  /-[A-Za-z0-9_-]{8}\.(?:avif|gif|jpe?g|mov|mp4|png|webm|webp)$/i;

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(file) : entry.isFile() ? [file] : [];
  });
}

function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function listOriginalMediaFiles(root = fileURLToPath(new URL("../", import.meta.url))) {
  const originalRoot = path.join(root, "Desktop image assets");
  return walkFiles(originalRoot)
    .filter((file) => originalMediaExtensions.has(path.extname(file).toLowerCase()))
    .sort();
}

export async function auditProductionMedia({
  root = fileURLToPath(new URL("../", import.meta.url)),
  output = path.join(root, "dist/public"),
} = {}) {
  const originals = listOriginalMediaFiles(root);
  const outputFiles = walkFiles(output);
  const mediaFiles = outputFiles.filter((file) =>
    originalMediaExtensions.has(path.extname(file).toLowerCase()));
  const unhashedMedia = mediaFiles
    .filter((file) => !hashedDeliveryMediaPattern.test(path.basename(file)))
    .map((file) => relativePosix(output, file))
    .sort();

  const originalsBySize = new Map();
  for (const original of originals) {
    const size = statSync(original).size;
    const files = originalsBySize.get(size) ?? [];
    files.push(original);
    originalsBySize.set(size, files);
  }

  const originalHashes = new Map();
  const originalMatches = [];
  for (const outputFile of outputFiles) {
    const candidates = originalsBySize.get(statSync(outputFile).size);
    if (!candidates) continue;

    const outputHash = await sha256(outputFile);
    for (const original of candidates) {
      let originalHash = originalHashes.get(original);
      if (!originalHash) {
        originalHash = await sha256(original);
        originalHashes.set(original, originalHash);
      }
      if (outputHash === originalHash) {
        originalMatches.push({
          output: relativePosix(output, outputFile),
          original: relativePosix(path.join(root, "Desktop image assets"), original),
        });
      }
    }
  }

  return {
    mediaFiles: mediaFiles.map((file) => relativePosix(output, file)).sort(),
    unhashedMedia,
    originalMatches,
  };
}

export async function assertProductionMediaClean(options = {}) {
  const audit = await auditProductionMedia(options);
  const failures = [];

  if (!audit.mediaFiles.length) {
    failures.push("No production media found; build the production output before auditing.");
  }
  if (audit.unhashedMedia.length) {
    failures.push(`Unhashed production media:\n${audit.unhashedMedia.map(file => `  - ${file}`).join("\n")}`);
  }
  if (audit.originalMatches.length) {
    failures.push(`Byte-identical original media in production output:\n${audit.originalMatches
      .map(({ output, original }) => `  - ${output} matches ${original}`)
      .join("\n")}`);
  }

  if (failures.length) {
    throw new Error(`Production media audit failed:\n${failures.join("\n")}`);
  }
  return audit;
}

export function optimizeMedia({
  root = fileURLToPath(new URL("../", import.meta.url)),
  args = process.argv.slice(2),
  execute = (command, arguments_) => execFileSync(command, arguments_, { stdio: ["ignore", "pipe", "inherit"] }),
} = {}) {
  const page = readFileSync(path.join(root, "src/pages/DesktopPage.tsx"), "utf8");
  const imports = [...page.matchAll(/import (\w+) from "\.\.\/\.\.\/delivery-media\/([^"]+)";/g)];
  if (!imports.length) throw new Error("No delivery assets found");
  const restTimes = new Map();
  for (const match of page.matchAll(/source:\s*(\w+),\s*type:\s*"video",\s*initialTime:\s*([\d.]+)/g)) {
    const time = Number(match[2]);
    if (Number.isFinite(time) && time > 0) {
      const times = restTimes.get(match[1]) ?? new Set();
      times.add(time);
      restTimes.set(match[1], times);
    }
  }
  const cache = openMediaCache(root);
  const force = args.includes("--force");
  const refreshNavigation = args.includes("--refresh-navigation");
  // Refresh one replaced source without re-encoding every other delivery file.
  const refreshAsset = args.find((argument) => argument.startsWith("--refresh="))
    ?.slice("--refresh=".length);
  if (refreshAsset && !imports.some(([, , relative]) => relative === refreshAsset)) {
    throw new Error(`Unknown delivery asset to refresh: ${refreshAsset}`);
  }
  const metadata = [];
  const records = [];
  const imageRecords = [];
  let originalBytes = 0;
  let deliveryBytes = 0;

  for (const [, name, relative] of imports) {
    const isVideo = relative.endsWith(".mp4");
    const navigation = relative.startsWith("Navigation/") || relative.endsWith("/Navigation_intro.mp4");
    const refresh = force || relative === refreshAsset || (refreshNavigation && navigation);
    const originalRelative = isVideo ? relative : relative.replace(/\.webp$/, "");
    const input = path.join(root, "Desktop image assets", originalRelative);
    originalBytes += statSync(input).size;
    const asset = cache.asset(relative, input, refresh, execute);
    try {
      let processed;
      if (isVideo) {
        // Tile loops play muted in the gallery. Preserve the Hulu title sequence's
        // soundtrack in its optimized file while keeping its hover preview muted.
        const tile = relative.startsWith("Desktop images/") || name === "altCtrlYeahYeahYeahsVideo";
        const preserveTileAudio = name === "huluUpHereVideo";
        const maxSize = navigation ? 1920 : tile ? 960 : 1920;
        processed = asset.output(relative, "ffmpeg", (input, temporary) => [
          "-hide_banner", "-loglevel", "error", "-y", "-i", input,
          "-map", "0:v:0", ...(tile && !preserveTileAudio ? ["-an"] : ["-map", "0:a:0?"]),
          "-vf", `scale=w='min(${maxSize},iw)':h='min(${maxSize},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2${navigation ? ",gradfun=strength=1.2:radius=16" : ""}`,
          "-c:v", "libx264", "-preset", navigation ? "slow" : "medium", "-crf", navigation ? "16" : tile ? "24" : "23",
          ...(navigation ? ["-x264-params", "aq-mode=3:aq-strength=1.2:deblock=-1,-1"] : []),
          "-threads", "4", "-pix_fmt", "yuv420p",
          ...(!tile || preserveTileAudio ? ["-c:a", "aac", "-b:a", "160k"] : []),
          "-movflags", "+faststart", temporary,
        ]);
      } else {
        processed = asset.output(relative, "magick", (input, temporary) => navigation
          ? [input, "-auto-orient", "-define", "webp:lossless=true", "-quality", "100", temporary]
          : [input, "-auto-orient", "-resize", "2560x2560>", "-quality", "85", temporary]);
      }
      deliveryBytes += statSync(processed).size;
      if (!isVideo) {
        const [width, height] = execFileSync("magick", ["identify", "-format", "%w %h", processed], { encoding: "utf8" })
          .trim().split(" ").map(Number);
        metadata.push(`import ${name} from ${JSON.stringify(`../delivery-media/${relative}`)};`);
        const variants = [];
        if (navigation) {
          for (const variantWidth of [640, 1280, 1920, 2560].filter((size) => size < width)) {
            const variantRelative = `${relative}.${variantWidth}w.webp`;
            const variantOutput = asset.output(variantRelative, "magick", (input, temporary) =>
              [input, "-auto-orient", "-resize", `${variantWidth}x>`,
                "-define", "webp:lossless=true", "-quality", "100", temporary]);
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
        asset.commit();
        continue;
      }
      const probe = JSON.parse(execFileSync("ffprobe", [
        "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
        "-of", "json", processed,
      ], { encoding: "utf8" })).streams[0];
      // Navigation rests on frame 10; Copilot rests on the final source frame.
      const copilot = relative === "Desktop images/Xbox_copilot_16x9.mp4";
      const posterFrame = copilot
        ? Number(JSON.parse(execFileSync("ffprobe", [
          "-v", "error", "-select_streams", "v:0", "-count_frames",
          "-show_entries", "stream=nb_read_frames", "-of", "json", input,
        ], { encoding: "utf8" })).streams[0].nb_read_frames) - 1
        : relative === "Desktop images/Navigation_intro.mp4" ? 9 : 0;
      if (!Number.isInteger(posterFrame) || posterFrame < 0) {
        throw new Error(`Unable to determine poster frame: ${relative}`);
      }
      const poster = asset.output(`${relative}.poster.webp`, "ffmpeg", (input, temporary) => [
        "-hide_banner", "-loglevel", "error", "-y",
        ...(name === "huluUpHereVideo" ? ["-ss", "7"] : []),
        "-i", input,
        "-frames:v", "1", "-vf", `select='eq(n,${posterFrame})',scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease`,
        "-c:v", "libwebp", ...(navigation ? ["-lossless", "1"] : ["-quality", "85"]), "-threads", "2", temporary,
      ]);
      deliveryBytes += statSync(poster).size;
      metadata.push(
        `import ${name} from ${JSON.stringify(`../delivery-media/${relative}`)};`,
        `import ${name}Poster from ${JSON.stringify(`../delivery-media/${relative}.poster.webp`)};`,
      );
      const restPosters = [];
      for (const time of restTimes.get(name) ?? []) {
        const posterRelative = `${relative}.poster-${time}.webp`;
        const restPoster = asset.output(posterRelative, "ffmpeg", (input, temporary) => [
          "-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", input,
          "-frames:v", "1", "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease",
          "-c:v", "libwebp", ...(navigation ? ["-lossless", "1"] : ["-quality", "85"]),
          "-threads", "2", temporary,
        ]);
        deliveryBytes += statSync(restPoster).size;
        const restName = `${name}Rest${String(time).replace(".", "_")}`;
        metadata.push(`import ${restName} from ${JSON.stringify(`../delivery-media/${posterRelative}`)};`);
        restPosters.push(`${time}: ${restName}`);
      }
      records.push(`  [${name}]: { poster: ${name}Poster, width: ${probe.width}, height: ${probe.height}${restPosters.length ? `, restPosters: { ${restPosters.join(", ")} }` : ""} },`);
      asset.commit();
    } finally {
      asset.cleanup();
    }
  }

  writeAtomic(path.join(root, "src/video-metadata.generated.ts"), [
    "// Generated by scripts/optimize-media.mjs. Do not edit by hand.",
    ...metadata,
    "",
    "export const videoMetadata: Record<string, { poster: string; width: number; height: number; restPosters?: Record<number, string> }> = {",
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--audit-production")) {
    try {
      const audit = await assertProductionMediaClean();
      console.log(`Production media audit passed (${audit.mediaFiles.length} media files).`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else {
    optimizeMedia();
  }
}
