/**
 * Derives JSPrismarine's own block state catalog from a captured Bedrock server.
 *
 * Runs once per protocol version the manifest declares under `versions`. Each version's
 * source and destination are in `datagen/manifest.json`; nothing here decides either.
 *
 * The input used to be `canonical_block_states.nbt`, a third party dump extracted with a
 * native mod hooking the server binary - the one leg of the extraction still leaning on
 * somebody else. It is now that version's `snapshot/v<protocol>/block-palette.json`, captured
 * from a Bedrock Dedicated Server directly. `datagen/README-palette.md` says how.
 *
 * What comes out is a description of *which properties each block has and which values they
 * accept* - not an ordered palette. Runtime ids are hashes computed from a block's own name
 * and state, so nothing here depends on the client's internal ordering, and a plugin can add
 * blocks without disturbing any of these.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { versionsOf } from './versions.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const SRC_DIR = path.join(HERE, '..', 'src');

/**
 * A value's type, as the catalog names it.
 *
 * The capture carries JavaScript values, and the three the protocol has map onto them one to
 * one. A boolean is a `byte` rather than a type of its own, which is what the wire has and
 * what the hash is computed over - `true` and `1` are not interchangeable there.
 */
const typeOf = (value) => {
    if (typeof value === 'boolean') return 'byte';
    if (typeof value === 'number') return 'int';
    if (typeof value === 'string') return 'string';

    throw new Error(`No block state type for ${typeof value}`);
};

/** Booleans travel as 0 and 1; everything else is already what it will be. */
const toWire = (value) => (typeof value === 'boolean' ? Number(value) : value);

for (const version of versionsOf(manifest, HERE)) {
    console.log(`Protocol ${version.protocol}:`);
    generateVersion(version);
}

/**
 * What to run to capture the palette for one version, as a maintainer would type it.
 *
 * Both halves come from a Bedrock Dedicated Server of that version, which only runs on Linux
 * x86-64; `packages/bedrock-data/utils/bedrock-dump/runner.ts` runs it in a container from
 * anywhere else.
 */
function howToCapture(protocol) {
    return (
        `  pnpm --filter @jsprismarine/bedrock-data run fetch:sources --protocol ${protocol}\n` +
        `  pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass palette --protocol ${protocol}\n` +
        `  pnpm --filter @jsprismarine/minecraft run generate:blocks\n` +
        'See datagen/README-palette.md.'
    );
}

function generateVersion({ protocol, config, isDefault }) {
    // A version may be declared for its enums before anyone has run a server of it. Skipping is
    // the honest answer there: an empty catalog would read as "this version has no blocks", and
    // the default version's catalog is this package's unversioned export, so that one still fails.
    if (config.blocks === undefined) {
        const message =
            `Protocol ${protocol} declares no block palette. Capture one, then add a \`blocks\` ` +
            `entry to its manifest version shaped like the default version's:\n${howToCapture(protocol)}`;
        if (!isDefault) {
            console.warn(`  skipped. ${message}`);
            return;
        }

        console.error(message);
        process.exit(1);
    }

    const source = path.resolve(HERE, config.blocks.source);
    if (!fs.existsSync(source)) {
        const message = `Missing ${source}.\n${howToCapture(protocol)}`;
        if (!isDefault) {
            console.warn(`  skipped. ${message}`);
            return;
        }

        console.error(message);
        process.exit(1);
    }

    const capture = JSON.parse(fs.readFileSync(source, 'utf8'));

    const blocks = {};
    let stateCount = 0;

    /**
     * The two halves, joined by the rule that separates them.
     *
     * Which properties a block has comes from `states` - the saved world, which stores what the
     * network carries. Which values each takes comes from `domains` - the game, asked block by
     * block. Taking the property list from the game instead would add the legacy properties a
     * flattened block still answers for, and every state built on one hashes to a runtime id no
     * client recognizes.
     */
    for (const [name, states] of Object.entries(capture.states).sort(([a], [b]) => a.localeCompare(b))) {
        const domains = capture.domains[name];
        if (domains === undefined) throw new Error(`${name} was saved to the world but the game did not describe it`);

        const properties = {};
        let permutations = 1;

        for (const property of Object.keys(states).sort()) {
            const domain = domains[property];
            if (domain === undefined)
                throw new Error(`${name} carries ${property} on the wire but the game has no values for it`);

            properties[property] = {
                type: typeOf(domain.default),
                values: domain.values.map(toWire),
                default: toWire(domain.default)
            };

            permutations *= domain.values.length;
        }

        blocks[name] = { properties };
        stateCount += permutations;
    }

    const output = {
        $comment:
            'Generated by packages/minecraft/datagen/generate-blocks.js - do not edit. Change the ' +
            'manifest and run `pnpm generate:blocks`. Runtime ids are hashes of name+states, so this ' +
            'describes what each block accepts; it is not an ordered palette and nothing depends on ' +
            'the order of these keys.',
        source: path.basename(source),
        minecraftVersion: capture.minecraftVersion,
        blockCount: Object.keys(blocks).length,
        stateCount,
        blocks
    };

    const target = path.resolve(HERE, config.blocks.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // The catalog type lives at `src/BlockSchemaCatalog`, and the output may be any depth under
    // `src/`, so the import is computed rather than spelled.
    const catalogImport = path
        .relative(path.dirname(target), path.join(SRC_DIR, 'BlockSchemaCatalog'))
        .split(path.sep)
        .join('/');
    // A TypeScript module with an explicit type rather than raw JSON: imported JSON would carry
    // a literal type spanning every block, which consumers and ahead-of-time compilation cannot use.
    fs.writeFileSync(
        target,
        [
            '// Generated by datagen/generate-blocks.js. Do not edit.',
            `import type { BlockSchemaCatalog } from '${catalogImport}';`,
            '',
            `export const blockSchemas: BlockSchemaCatalog = ${JSON.stringify(output, null, 2)};`,
            ''
        ].join('\n')
    );

    console.log(`Wrote ${path.relative(process.cwd(), target)}`);
    console.log(`  ${output.blockCount} blocks, ${stateCount} states, from ${capture.server}`);

    // The default version answers the unversioned path, so `generated/block-schemas` keeps
    // resolving without duplicating the 400 KB catalog.
    if (isDefault) {
        fs.writeFileSync(
            path.join(SRC_DIR, 'generated', 'block-schemas.ts'),
            [
                '// Generated by datagen/generate-blocks.js. Do not edit.',
                `// Re-exports the default protocol version, ${protocol}.`,
                `export * from './v${protocol}/block-schemas';`,
                ''
            ].join('\n')
        );
        console.log('  re-exported at the unversioned path');
    }
}
