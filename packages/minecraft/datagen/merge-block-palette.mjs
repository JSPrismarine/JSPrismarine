/**
 * Joins the two halves of a block palette capture into `snapshot/block-palette.json`.
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
 * world never saved is reported - it is a block the first pass lost, and the catalogue is
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
const TARGET = path.join(HERE, 'snapshot', 'block-palette.json');

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

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

const output = {
    $comment: [
        'Captured from a Bedrock Dedicated Server, not taken from a third party dump.',
        'See packages/minecraft/datagen/README-palette.md for how to reproduce it.',
        '',
        '`states` is what a saved world stores for one placed block of each type: the property',
        'names the *network* carries, which is the half the Script API cannot answer - it reports',
        "a flattened block's legacy properties too, and from inside the game there is no way to",
        'tell which of them the wire has.',
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
