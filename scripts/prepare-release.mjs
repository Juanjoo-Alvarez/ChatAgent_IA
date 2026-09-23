import { createHash } from "node:crypto";
import { log } from "node:console";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const outputDirectory = path.join(repositoryRoot, "release-artifacts");
const embedDirectory = path.join(repositoryRoot, "packages", "embed", "dist");

// La versión raíz es la fuente única para nombrar todos los archivos públicos.
const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8")
);
const version = rootPackage.version;
const command = argv[2];

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("The root package.json must contain a valid release version.");
}

if (command !== "stage" && command !== "checksum") {
  throw new Error("Expected the stage or checksum command.");
}

const artifacts = [
  {
    source: "agichat-widget.js",
    destination: `agichat-widget-v${version}.esm.js`
  },
  {
    source: "agichat-widget.iife.js",
    destination: `agichat-widget-v${version}.iife.js`
  }
];

if (command === "stage") {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const artifact of artifacts) {
    const sourcePath = path.join(embedDirectory, artifact.source);
    const destinationPath = path.join(outputDirectory, artifact.destination);

    await cp(sourcePath, destinationPath);
  }

  log(`Staged ${artifacts.length} browser bundles for v${version}.`);
} else {
  const artifactNames = (await readdir(outputDirectory))
    .filter((name) => name !== "SHA256SUMS.txt")
    .sort();
  const checksums = [];

  for (const artifactName of artifactNames) {
    // Publicar el hash junto al archivo permite comprobar que la descarga no
    // fue modificada ni dañada antes de integrarla en otro sitio.
    const contents = await readFile(path.join(outputDirectory, artifactName));
    const checksum = createHash("sha256").update(contents).digest("hex");
    checksums.push(`${checksum}  ${artifactName}`);
  }

  await writeFile(
    path.join(outputDirectory, "SHA256SUMS.txt"),
    `${checksums.join("\n")}\n`,
    "utf8"
  );

  log(`Checksummed ${artifactNames.length} release artifacts for v${version}.`);
}
