/**
 * Extracts block tags from the pinned `bedrock-samples` behavior pack into the
 * table the vanilla overlay generator consumes.
 *
 * Run after `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` with
 * `pnpm --filter @jsprismarine/blocks run generate:block-tags`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../..');
const sourceManifest = JSON.parse(readFileSync(join(repoRoot, 'packages/bedrock-data/sources.json'), 'utf8'));
const samplePin = sourceManifest.bedrockSamples;
const wrapper = `bedrock-samples-${samplePin.commit}`;
const sampleCache = join(repoRoot, 'node_modules/.cache/jsprismarine/bedrock-samples', samplePin.tag, 'unpacked');
const configuredSource = process.env.JSP_BEDROCK_SAMPLES_PATH;
const candidateRoots = [
    configuredSource,
    configuredSource === undefined ? undefined : join(configuredSource, wrapper),
    join(sampleCache, wrapper),
    sampleCache
].filter((candidate) => candidate !== undefined);
const sampleRoot = candidateRoots.find((candidate) => existsSync(join(candidate, 'behavior_pack', 'blocks')));

if (sampleRoot === undefined) {
    throw new Error(
        'The pinned Bedrock samples are missing. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'or set JSP_BEDROCK_SAMPLES_PATH to the unpacked sample root.'
    );
}

const blocksDirectory = join(sampleRoot, 'behavior_pack/blocks');
const tagsByIdentifier = new Map();
const blockFiles = readdirSync(blocksDirectory)
    .filter((file) => file.endsWith('.block.json'))
    .sort();

for (const file of blockFiles) {
    const document = JSON.parse(readFileSync(join(blocksDirectory, file), 'utf8'));
    const block = document['minecraft:block'];
    const identifier = block?.description?.identifier;
    if (typeof identifier !== 'string') throw new Error(`${file} has no block identifier`);

    const components = block.components ?? {};
    if (Object.hasOwn(components, 'minecraft:tags')) {
        const tags = components['minecraft:tags'];
        if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
            throw new Error(`${file} has an invalid minecraft:tags component`);
        }
        if (tagsByIdentifier.has(identifier)) throw new Error(`${file} duplicates tags for ${identifier}`);
        tagsByIdentifier.set(identifier, tags);
    }

    const permutations = Array.isArray(block.permutations) ? block.permutations : [];
    if (
        permutations.some(
            (permutation) =>
                typeof permutation.components === 'object' &&
                permutation.components !== null &&
                Object.hasOwn(permutation.components, 'minecraft:tags')
        )
    ) {
        throw new Error(`${file} writes minecraft:tags in a permutation; the overlay table is block-wide`);
    }
}

const entries = [...tagsByIdentifier].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
const output = join(packageDir, 'src/tables/vanillaBlockTags.json');
writeFileSync(output, `${JSON.stringify(Object.fromEntries(entries), undefined, 4)}\n`);
console.log(
    `Wrote ${tagsByIdentifier.size} vanilla block tag entries from bedrock-samples ${samplePin.tag} to ${output}`
);
