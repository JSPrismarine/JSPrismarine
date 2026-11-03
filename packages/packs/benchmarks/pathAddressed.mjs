import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const roots = process.argv.slice(2).filter((argument) => argument !== '--');
if (roots.length === 0) {
    throw new Error('Pass one or more pack directories in stack order.');
}

const { isPathAddressedRegistry, load, parseLenientJson, parseManifest, routeForPath } =
    await import('../dist/index.es.js');
const stack = roots.map((path) => ({ kind: 'directory', path }));
const files = [];
const lastProvider = new Map();
const loadablePacks = roots.map((root) => {
    try {
        const bytes = readFileSync(join(root, 'manifest.json'), 'utf8');
        return parseManifest(parseLenientJson(bytes), root).manifest !== undefined;
    } catch {
        return false;
    }
});

for (const [provider, root] of roots.entries()) {
    if (!loadablePacks[provider]) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        const path = relative(root, absolute).split(sep).join('/');
        const registry = routeForPath(path);
        if (registry === undefined) continue;
        files.push({ path, provider, pathAddressed: isPathAddressedRegistry(registry) });
        lastProvider.set(path, provider);
    }
}

const counts = {
    routedFiles: files.length,
    livePathAddressedParsed: 0,
    supersededPathAddressedSkipped: 0,
    liveContentAddressedParsed: 0,
    supersededContentAddressedParsed: 0,
    totalDefinitionParses: 0
};
for (const file of files) {
    const superseded = lastProvider.get(file.path) !== file.provider;
    if (file.pathAddressed && superseded) {
        counts.supersededPathAddressedSkipped++;
        continue;
    }
    counts.totalDefinitionParses++;
    if (file.pathAddressed) counts.livePathAddressedParsed++;
    else if (superseded) counts.supersededContentAddressedParsed++;
    else counts.liveContentAddressedParsed++;
}

const samples = [];
for (let sample = 0; sample < 6; sample++) {
    const started = performance.now();
    load(stack);
    const elapsedMs = performance.now() - started;
    if (sample > 0) samples.push(elapsedMs);
}
samples.sort((left, right) => left - right);
const medianMs = samples[Math.floor(samples.length / 2)];

console.log(
    JSON.stringify(
        {
            roots: roots.map((root) => pathToFileURL(root).href),
            warmSamples: samples.length,
            medianLoadMs: Number(medianMs.toFixed(2)),
            skippedManifestPacks: loadablePacks.filter((loadable) => !loadable).length,
            parseCounts: counts
        },
        null,
        2
    )
);
