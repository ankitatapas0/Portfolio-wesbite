import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const schema = 1;

// Stream large originals instead of loading entire films into memory.
export function sourceDigest(file) {
  const hash = createHash("sha256");
  const fd = openSync(file, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

export function writeAtomic(file, content) {
  if (existsSync(file) && readFileSync(file, "utf8") === content) return;
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

export function openMediaCache(root) {
  const file = path.join(root, "media-cache.generated.json");
  // Unknown schemas are cold caches. Invalid JSON fails explicitly.
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const data = previous?.schema === schema ? previous : { schema, assets: {} };
  if (!data.assets || typeof data.assets !== "object" || Array.isArray(data.assets)) {
    throw new Error(`Invalid media cache: ${file}`);
  }
  const save = () => writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
  return {
    asset(relative, input, force, execute) {
      const sourceSha256 = sourceDigest(input);
      const previousAsset = data.assets[relative];
      const outputs = {};
      const staged = [];
      let invalidated = false;
      return {
        output(outputRelative, command, argumentsFor) {
          const output = path.join(root, "delivery-media", outputRelative);
          const temporary = `${output}.tmp${path.extname(output)}`;
          // Hash the actual encoder arguments, substituting portable path tokens.
          const recipe = [command, argumentsFor("$source", "$output")];
          const key = createHash("sha256")
            .update(JSON.stringify([schema, sourceSha256, recipe])).digest("hex");
          outputs[outputRelative] = key;
          if (!force && previousAsset?.outputs?.[outputRelative] === key
            && existsSync(output) && statSync(output).size > 0) {
            return output;
          }
          // Invalidate before processing: an interrupted/failed refresh must retry.
          if (!invalidated) {
            delete data.assets[relative];
            save();
            invalidated = true;
          }
          mkdirSync(path.dirname(output), { recursive: true });
          staged.push({ temporary, output });
          rmSync(temporary, { force: true });
          console.log(`Encoding ${outputRelative}`);
          execute(command, argumentsFor(input, temporary));
          if (!existsSync(temporary) || statSync(temporary).size === 0) {
            throw new Error(`Encoder produced no media: ${outputRelative}`);
          }
          return temporary;
        },
        commit() {
          // Publish derivatives only after all encoders and dimension probes pass.
          for (const { temporary, output } of staged) renameSync(temporary, output);
          data.assets[relative] = { sourceSha256, outputs };
          save();
        },
        cleanup() {
          for (const { temporary } of staged) rmSync(temporary, { force: true });
        },
      };
    },
  };
}
