import { createHash } from "node:crypto";
import { log } from "node:console";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputDirectory = path.join(repositoryRoot, "release-artifacts");
const embedDirectory = path.join(repositoryRoot, "packages", "embed", "dist");

const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8")
);
const version = rootPackage.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("The root package.json must contain a valid release version.");
}

const artifacts = [
  {
    source: "agichat-widget.js",
    destination: `agichat-widget-v${version}.esm.js`
  },
  {
    source: "agichat-widget.iife.js",
    destination: `agichat-widget-v${version}.iife.js`
  },
  {
    source: "index.d.ts",
    destination: `agichat-widget-v${version}.d.ts`
  }
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const checksums = [];

for (const artifact of artifacts) {
  const sourcePath = path.join(embedDirectory, artifact.source);
  const destinationPath = path.join(outputDirectory, artifact.destination);

  await cp(sourcePath, destinationPath);
  const contents = await readFile(destinationPath);
  const checksum = createHash("sha256").update(contents).digest("hex");
  checksums.push(`${checksum}  ${artifact.destination}`);
}

await writeFile(
  path.join(outputDirectory, "SHA256SUMS.txt"),
  `${checksums.join("\n")}\n`,
  "utf8"
);

log(`Prepared ${artifacts.length} release artifacts for v${version}.`);
