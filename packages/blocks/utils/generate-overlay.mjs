/**
 * Writes the `jsprismarine_vanilla` overlay pack into `vanilla_overlay/`:
 * one Bedrock block definition per palette block, with the components filled
 * from `@jsprismarine/mapping`'s Java-sourced property table.
 *
 * Run as `pnpm --filter @jsprismarine/blocks run generate:overlay`, which
 * builds the package first. The output is committed, so a palette or
 * property-table bump shows up as a reviewable diff rather than as a silent
 * change at load.
 *
 * This is plain JavaScript over the built `dist/`, the way
 * `packages/bedrock-data/utils/java-dump/run.mjs` is, so that nothing in
 * `src/` has to be written for `node`'s resolver. An earlier version imported
 * `../src/overlay.ts` directly, which forced `src/overlay.ts` to spell its own
 * import `./families.ts`, and that in turn forced every package depending on
 * `@jsprismarine/blocks` to set `allowImportingTsExtensions`.
 *
 * The property table is read as a file rather than imported, the way
 * `packages/mapping/utils/generate/generate-block-properties.ts` reads its
 * own inputs, because plain `node` cannot import that package's JSON without
 * an import attribute. `src/overlay.test.ts` checks that what this writes
 * matches what `JAVA_BLOCK_PROPERTIES` produces, so the two cannot drift.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';

import { OVERLAY_PACK_NAME, generateVanillaOverlay } from '../dist/overlay.es.js';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../..');
const target = join(packageDir, 'vanilla_overlay');

// The generated table is parsed JSON; @jsprismarine/mapping's generator
// guarantees the `blocks` and `bedrockOnly` shape this reads.
const table = JSON.parse(readFileSync(join(repoRoot, 'packages/mapping/src/tables/blockProperties.json'), 'utf8'));

const identifiers = Object.keys(blockSchemas.blocks).sort();

const pack = generateVanillaOverlay(
    {
        bedrockOnly: new Set(table.bedrockOnly),
        propertiesOf: (identifier) => table.blocks[identifier]?.base
    },
    identifiers
);

rmSync(target, { recursive: true, force: true });
for (const file of pack.files) {
    const absolute = join(target, ...file.path.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.content);
}

const written = readdirSync(join(target, 'blocks')).length;
console.log(
    `${OVERLAY_PACK_NAME}: ${written} block definitions, ${pack.displayNameCount} display names, ${pack.exceptions.length} reviewed exceptions`
);
console.log(
    `friction clamped for ${pack.frictionClamps.length}: ${pack.frictionClamps.map((clamp) => clamp.identifier).join(', ')}`
);
console.log(`behavior families: ${Object.keys(pack.behaviorCounts).length}`);
for (const [behavior, count] of Object.entries(pack.behaviorCounts)) console.log(`  ${behavior} ${count}`);
