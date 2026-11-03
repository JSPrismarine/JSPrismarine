import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const packetSource = path.join(packageRoot, 'src/packet');
const packetNames = readdirSync(packetSource).filter((filename) => {
    if (!filename.endsWith('.ts') || filename.endsWith('.test.ts')) return false;
    return readFileSync(path.join(packetSource, filename), 'utf8').includes('extends NetworkPacket<');
});

for (const filename of packetNames) {
    const name = filename.slice(0, -3);
    const source = await import(new URL(`../src/packet/${filename}`, import.meta.url));
    const dist = await import(new URL(`../dist/packet/${name}.es.js`, import.meta.url));
    assert.equal(dist.default.name, source.default.name, `${filename} class name`);
}

console.log(`Matched class names for ${packetNames.length} packet modules.`);
