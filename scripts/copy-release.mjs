import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const filename = `chatpassport-${packageJson.version}-chrome.zip`;
const source = resolve(projectRoot, ".output", filename);
const destinationDirectory = resolve(projectRoot, "release");
const destination = resolve(destinationDirectory, filename);

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log(`Prepared ${destination}`);
