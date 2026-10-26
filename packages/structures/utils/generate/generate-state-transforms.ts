/**
 * Generates `src/tables/stateTransforms.json`: how every Bedrock block state
 * reachable from Java rotates and mirrors.
 *
 * The rules come from Java Edition itself. `utils/java-dump/run.mjs` compiles
 * a dumper against the pinned server jar and records, for all 35723 Java
 * states, what `BlockState.rotate` and `BlockState.mirror` return. This
 * script replays that through `@jsprismarine/mapping` so the result is keyed
 * by Bedrock state, which is what the server places, and the two editions'
 * different direction axis names never have to be reconciled by hand.
 *
 * Run after a Java or Bedrock version bump:
 *
 *     pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 *     pnpm --filter @jsprismarine/structures run generate:transforms
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRANSFORM_NAMES } from '../../src/tableShape.ts';
import { dumpBlockTransforms } from '../java-dump/run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const tablePath = resolve(here, '../../src/tables/stateTransforms.json');

// Node cannot load another package's TypeScript sources, which import each
// other without file extensions, so the generator reads the built mapping.
const mappingDist = resolve(here, '../../../mapping/dist');
if (!existsSync(mappingDist)) {
    throw new Error('Build the mapping package first: pnpm exec turbo run build --filter=@jsprismarine/mapping');
}
const { javaBlockStateToBedrock } = await import(`${mappingDist}/index.es.js`);
const { blocksTable } = await import(`${mappingDist}/tables.es.js`);

/** Compares strings by code unit so generated keys do not depend on the host locale. */
const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** The dumper's output shape; it is this repository's own JSON, not a third-party format. */
interface BlockTransformDump {
    javaVersion: string;
    blocks: Record<string, { properties: string[]; states: string[][] } & Record<string, number[]>>;
}

const dump = JSON.parse(readFileSync(dumpBlockTransforms(), 'utf8')) as BlockTransformDump;

/**
 * Each Bedrock identifier's state keys in alphabetical order with the value
 * domain of each, gathered from the mapping's palette. The table indexes a
 * state by the cross product of these domains with the last key varying
 * fastest, so it is self-contained and the runtime never reads the mapping
 * table's own tuple order.
 */
interface IdentifierShape {
    keys: string[];
    domains: (string | number)[][];
    strides: number[];
    size: number;
}

const shapes = new Map<string, IdentifierShape>();
for (const [name, keys, tuples] of blocksTable.statePalette) {
    const identifier = `minecraft:${name}`;
    if (shapes.has(identifier)) throw new Error(`${identifier} appears twice in the mapping state palette`);

    const order = keys.map((key, axis) => [key, axis] as const).sort(([a], [b]) => compareCodeUnits(a, b));
    const domains = order.map(([, axis]) => {
        const seen: (string | number)[] = [];
        for (const values of tuples) {
            const value = values[axis] ?? '';
            if (!seen.includes(value)) seen.push(value);
        }
        return seen;
    });
    const strides = domains.map((_, position) =>
        domains.slice(position + 1).reduce((product, domain) => product * domain.length, 1)
    );
    shapes.set(identifier, {
        keys: order.map(([key]) => key),
        domains,
        strides,
        size: domains.reduce((product, domain) => product * domain.length, 1)
    });
}

/** The cross-product index of a Bedrock state within its identifier's shape. */
const indexOf = (shape: IdentifierShape, states: Readonly<Record<string, string | number>>): number | undefined => {
    let index = 0;
    for (const [axis, key] of shape.keys.entries()) {
        const position = (shape.domains[axis] ?? []).indexOf(states[key] ?? '');
        if (position < 0) return undefined;
        index += position * (shape.strides[axis] ?? 1);
    }
    return index;
};

/** The identifier and state index a Java state resolves to, or undefined where it does not map. */
const resolveState = (javaId: string, properties: Record<string, string>): [string, number] | undefined => {
    const result = javaBlockStateToBedrock(javaId, properties);
    if (result.kind === 'unknown' || result.kind === 'passthrough') return undefined;
    const shape = shapes.get(result.bedrock.name);
    if (shape === undefined) return undefined;
    const index = indexOf(shape, result.bedrock.states);
    return index === undefined ? undefined : [result.bedrock.name, index];
};

const transforms = new Map<string, Map<string, number[]>>();
const conflicts = new Map<string, { identifier: string; transform: string; state: number }>();
const crossIdentifier: { from: string; to: string; transform: string }[] = [];
let unmapped = 0;

for (const [javaId, block] of Object.entries(dump.blocks)) {
    const propertiesOf = (index: number): Record<string, string> =>
        Object.fromEntries(block.properties.map((name, axis) => [name, block.states[index]?.[axis] ?? '']));

    for (let index = 0; index < block.states.length; index++) {
        const source = resolveState(javaId, propertiesOf(index));
        if (source === undefined) {
            unmapped++;
            continue;
        }
        const [identifier, from] = source;
        const count = shapes.get(identifier)?.size ?? 0;

        for (const transform of TRANSFORM_NAMES) {
            const targetIndex = block[transform]?.[index];
            if (targetIndex === undefined) continue;
            const target = resolveState(javaId, propertiesOf(targetIndex));
            if (target === undefined) continue;
            if (target[0] !== identifier) {
                crossIdentifier.push({ from: identifier, to: target[0], transform });
                continue;
            }

            let perIdentifier = transforms.get(identifier);
            if (perIdentifier === undefined) transforms.set(identifier, (perIdentifier = new Map()));
            let permutation = perIdentifier.get(transform);
            if (permutation === undefined) {
                permutation = Array.from({ length: count }, (_, i) => i);
                perIdentifier.set(transform, permutation);
            }
            const existing = permutation[from];
            if (existing !== undefined && existing !== from && existing !== target[1]) {
                // Several Java states collapsed onto this Bedrock state and
                // they do not transform alike, so the Bedrock state cannot
                // say which one it was. The first observation wins and the
                // ambiguity is recorded for the caller to see.
                conflicts.set(`${identifier}|${transform}|${from}`, { identifier, transform, state: from });
                continue;
            }
            permutation[from] = target[1];
        }
    }
}

const identifiers: Record<string, unknown> = {};
for (const [identifier, perIdentifier] of [...transforms].sort(([a], [b]) => compareCodeUnits(a, b))) {
    const shape = shapes.get(identifier);
    if (shape === undefined) continue;
    const moving: Record<string, number[]> = {};
    for (const transform of TRANSFORM_NAMES) {
        const permutation = perIdentifier.get(transform);
        if (permutation === undefined || permutation.every((target, index) => target === index)) continue;
        moving[transform] = permutation;
    }
    if (Object.keys(moving).length === 0) continue;
    identifiers[identifier] = { keys: shape.keys, domains: shape.domains, ...moving };
}

const ambiguous = [...conflicts.values()].sort(
    (a, b) =>
        compareCodeUnits(a.identifier, b.identifier) || compareCodeUnits(a.transform, b.transform) || a.state - b.state
);

const table = {
    javaVersion: dump.javaVersion,
    bedrockVersion: blocksTable.bedrockVersion,
    geyserMappingsCommit: blocksTable.geyserMappingsCommit,
    paletteStateCount: blocksTable.statePalette.reduce((total, [, , tuples]) => total + tuples.length, 0),
    ambiguous,
    identifiers
};

writeFileSync(tablePath, `${JSON.stringify(table)}\n`);
// The table is committed, and the repository checks every file against
// Prettier, so the generator leaves it in the shape Prettier wants.
execFileSync('node', [resolve(repoRoot, 'node_modules/prettier/bin/prettier.cjs'), '--write', tablePath], {
    stdio: 'inherit'
});

const byIdentifier = new Map<string, number>();
for (const entry of ambiguous) byIdentifier.set(entry.identifier, (byIdentifier.get(entry.identifier) ?? 0) + 1);

console.log(`Wrote ${tablePath}`);
console.log(`  identifiers that move: ${Object.keys(identifiers).length}`);
console.log(`  palette states: ${table.paletteStateCount}`);
console.log(`  Java states with no mapped Bedrock state: ${unmapped}`);
console.log(`  ambiguous transforms: ${ambiguous.length} over ${byIdentifier.size} identifiers`);
for (const [identifier, count] of [...byIdentifier].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${identifier}: ${count}`);
}
console.log(`  cross-identifier transforms: ${crossIdentifier.length}`);
for (const cross of crossIdentifier.slice(0, 20)) console.log('    cross', cross);
