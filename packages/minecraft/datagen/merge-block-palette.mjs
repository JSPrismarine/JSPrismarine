/**
 * Joins the two halves of a block palette capture into `snapshot/v<protocol>/block-palette.json`.
 *
 * ```
 * node datagen/merge-block-palette.mjs states.json domains.jsonl 1.26.51 bedrock-server-1.26.51.1
 * ```
 *
 * `states.json` is what `extract-block-palette.mjs` read out of the saved world: the property
 * names the network carries, one placed block per type. `domains.jsonl` is the `PALETTE BLOCK`
 * lines the second pass wrote to the server log, one per type: every property the game knows
 * for the block and the values it accepts. `README-palette.md` says how both are made.
 *
 * The merge checks what it can: every block the world saved must have been described by the
 * game, every network property must have a domain, and a block the game describes that the
 * world never saved is reported - it is a block the first pass lost, and the catalog is
 * short by one until it is placed somewhere it can stand.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [statesFile, domainsFile, minecraftVersion, server] = process.argv.slice(2);
if (!statesFile || !domainsFile || !minecraftVersion || !server) {
    console.error('usage: merge-block-palette.mjs <states.json> <domains.jsonl> <minecraftVersion> <server>');
    process.exit(2);
}

const HERE = path.dirname(new URL(import.meta.url).pathname);

// The capture lands in the snapshot directory of the version it belongs to, found by the
// Minecraft version it was taken from. A capture for a version the manifest does not declare
// has no home yet: declare the version first.
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const declared = Object.entries(manifest.versions).filter(([key]) => !key.startsWith('$'));
const match = declared.find(([, config]) => config.schemas.minecraftVersion === minecraftVersion);
if (!match) {
    console.error(
        `No declared version targets Minecraft ${minecraftVersion}; the manifest declares ` +
            `${declared.map(([, config]) => config.schemas.minecraftVersion).join(', ')}.`
    );
    process.exit(2);
}
const TARGET = path.join(HERE, 'snapshot', `v${match[0]}`, 'block-palette.json');

const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));

const domains = {};
for (const line of fs.readFileSync(domainsFile, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const { name, props } = JSON.parse(line);
    domains[name] = props;
}

const missingDomains = Object.keys(states).filter((name) => !(name in domains));
if (missingDomains.length > 0) {
    throw new Error(`The world saved blocks the game did not describe: ${missingDomains.join(', ')}`);
}

const missingStates = Object.keys(domains).filter((name) => !(name in states));
if (missingStates.length > 0) {
    console.warn(
        `The game describes ${missingStates.length} block(s) the world never saved - the first pass lost them:`
    );
    for (const name of missingStates) console.warn(`  ${name}`);
}

for (const [name, properties] of Object.entries(states)) {
    const missing = Object.keys(properties).filter((property) => !(property in domains[name]));
    if (missing.length > 0) {
        throw new Error(`${name} carries ${missing.join(', ')} on the wire but the game has no values for it`);
    }
}

/**
 * The property names a block carries, each against the value the game declares for it.
 *
 * Only the names are the answer here - a saved world is asked which properties the network
 * carries, and the game is asked separately which values each one takes. The value the world
 * happened to store is not the answer and is not even stable: a fence records whichever
 * neighbors the placement grid gave it, cave vines record whatever age a random tick grew them
 * to, and a chest records whichever way the placer faced. Captured twice, 54 blocks disagreed
 * with themselves that way, which left the committed file byte stable only by luck.
 *
 * So each value is replaced by the one the game reports for the block's own default
 * permutation, which is the value `generate-blocks.js` already writes into the schema as the
 * default. That is determined, so two captures of one server agree.
 */
const determined = (name, properties) =>
    Object.fromEntries(
        Object.keys(properties)
            .sort((a, b) => a.localeCompare(b))
            .map((property) => {
                const domain = domains[name][property];
                if (!domain.values.includes(domain.default)) {
                    throw new Error(
                        `${name}.${property} defaults to ${JSON.stringify(domain.default)}, which is not one of ` +
                            `the values the game accepts for it: ${JSON.stringify(domain.values)}`
                    );
                }

                return [property, domain.default];
            })
    );

for (const [name, properties] of Object.entries(states)) states[name] = determined(name, properties);

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

const output = {
    $comment: [
        'Captured from a Bedrock Dedicated Server, not taken from a third party dump.',
        'See packages/minecraft/datagen/README-palette.md for how to reproduce it.',
        '',
        '`states` is which properties a saved world stores for one placed block of each type: the',
        'property *names* the network carries, which is the half the Script API cannot answer - it',
        "reports a flattened block's legacy properties too, and from inside the game there is no way",
        'to tell which of them the wire has. Only the names come from the world. Each value is the',
        "game's own default for that property on that block, because what the world stored depends",
        'on neighbors, random ticks and the placer, and so differs between two captures of one server.',
        '',
        '`domains` is what the game accepts for each of those properties, asked block by block',
        'rather than by property name - `age` is declared 0..15 game wide and cocoa takes 0..2.'
    ],
    minecraftVersion,
    server,
    states: sorted(states),
    domains: sorted(domains)
};

fs.writeFileSync(TARGET, `${JSON.stringify(output, null, 0).replaceAll('},"', '},\n"')}\n`);
console.log(`Wrote ${path.relative(process.cwd(), TARGET)}: ${Object.keys(states).length} blocks`);
