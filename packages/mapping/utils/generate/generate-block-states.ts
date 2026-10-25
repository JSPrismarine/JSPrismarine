/**
 * Generates `src/tables/blockStates.json`: the per-block state vocabularies, which say how a
 * Bedrock block spells the values Java spells as words (plan section 5, the state half of the
 * seam).
 *
 * Java writes a direction as `facing=north`; Bedrock writes it as a number under a state name
 * of its own, and the number is not the same for every block - a dropper's `facing_direction`
 * calls north 2 and a piston's calls it 3. Nothing can be derived from the name, so this reads
 * the correspondence out of the vendored block mapping: for every Bedrock block and every state
 * it carries, the one Java property that determines that state, and the value each of its words
 * produces.
 *
 * Only committed inputs, so this needs no fetched sources:
 *
 * ```sh
 * pnpm --filter @jsprismarine/mapping run generate:block-states
 * ```
 *
 * It refuses to emit when two Java blocks mapping onto one Bedrock block disagree about a
 * state, and when a Bedrock state that no single Java property determines has no reviewed
 * entry in `BLOCK_STATE_LOSSES`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLOCK_STATE_LOSSES } from '../../src/lossList.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

interface BlocksTable {
    javaVersion: string;
    bedrockVersion: string;
    statePalette: [name: string, keys: string[], values: (string | number)[][]][];
    blocks: Record<
        string,
        { properties?: Record<string, string[]>; default: number; targets: (number | [number, number])[] }
    >;
}

// The vendored block table; `src/tables.ts` documents the shape the table generator guarantees.
const blocksTable = readJson(join(packageDir, 'src/tables/blocks.json')) as BlocksTable;

/** The Bedrock target states in palette-index order, mirroring `src/blockMapping.ts`. */
const targetPalette = blocksTable.statePalette.flatMap(([name, keys, tuples]) =>
    tuples.map((values) => ({
        name: `minecraft:${name}`,
        states: Object.fromEntries(keys.map((key, axis) => [key, values[axis] ?? ''])) as Record<
            string,
            string | number
        >
    }))
);

/** The Java property values at one in-block state index, the cross product's axis order. */
const propertiesAt = (axes: [string, string[]][], index: number): Record<string, string> => {
    const properties: Record<string, string> = {};
    let remainder = index;
    for (let axis = axes.length - 1; axis >= 0; axis--) {
        const [property, values] = axes[axis]!;
        properties[property] = values[remainder % values.length]!;
        remainder = Math.floor(remainder / values.length);
    }
    return properties;
};

/**
 * Whether a Java value is a word rather than a number or a boolean.
 *
 * Numbers and booleans are the same fact in both editions - Bedrock writes `true` as 1 and an
 * age as itself - so only the words need a vocabulary.
 */
const isWord = (value: string): boolean => !/^-?\d+$/.test(value) && value !== 'true' && value !== 'false';

// ---------------------------------------------------------------------------
// The per-block, per-state vocabularies
// ---------------------------------------------------------------------------

/** Per Bedrock block, per state it carries, the Java word each Bedrock value spells. */
const vocabularies = new Map<string, Map<string, Map<string, string | number>>>();
/** Bedrock states no single Java property determines, which is where the vocabulary runs out. */
const unresolved = new Map<string, Set<string>>();

for (const [javaId, block] of Object.entries(blocksTable.blocks)) {
    const axes = Object.entries(block.properties ?? {});
    if (axes.length === 0) continue;

    const targets: number[] = [];
    for (const run of block.targets) {
        if (typeof run === 'number') targets.push(run);
        else for (let count = 0; count < run[1]; count++) targets.push(run[0]);
    }

    // One Java block can reach more than one Bedrock block - Java's piston head is both the
    // plain and the sticky arm - and each of them gets its own vocabulary.
    const byBedrockName = new Map<string, number[]>();
    targets.forEach((target, index) => {
        const name = targetPalette[target]?.name ?? '';
        const indices = byBedrockName.get(name);
        if (indices === undefined) byBedrockName.set(name, [index]);
        else indices.push(index);
    });

    for (const [name, indices] of byBedrockName) {
        // Per Bedrock state key, per Java property, the Bedrock values each Java value produced.
        const observed = new Map<string, Map<string, Map<string, Set<string | number>>>>();
        for (const index of indices) {
            const properties = propertiesAt(axes, index);
            const target = targetPalette[targets[index]!];
            for (const [key, value] of Object.entries(target?.states ?? {})) {
                let byProperty = observed.get(key);
                if (byProperty === undefined) observed.set(key, (byProperty = new Map()));
                for (const [property, word] of Object.entries(properties)) {
                    let seen = byProperty.get(property);
                    if (seen === undefined) byProperty.set(property, (seen = new Map()));
                    let values = seen.get(word);
                    if (values === undefined) seen.set(word, (values = new Set()));
                    values.add(value);
                }
            }
        }

        for (const [key, byProperty] of observed) {
            const spread = new Set(indices.map((index) => targetPalette[targets[index]!]?.states[key]));
            // A state the block holds at one value carries no information to translate.
            if (spread.size < 2) continue;

            // The Java property that determines this state on its own: every one of its values
            // picks exactly one Bedrock value, and between them they reach all of them.
            const determiners = [...byProperty].filter(
                ([, seen]) =>
                    seen.size >= 2 &&
                    [...seen.values()].every((values) => values.size === 1) &&
                    new Set([...seen.values()].map((values) => [...values][0])).size === spread.size
            );

            const words = determiners.filter(([, seen]) => [...seen.keys()].some(isWord));
            if (words.length === 0) {
                // Either no Java property determines it - Bedrock folded several into one
                // state - or the Java side is numbers and booleans, which need no vocabulary.
                if (determiners.length === 0) {
                    let keys = unresolved.get(name);
                    if (keys === undefined) unresolved.set(name, (keys = new Set()));
                    keys.add(key);
                }
                continue;
            }

            const [, seen] = words[0]!;
            const vocabulary = new Map([...seen].map(([word, values]) => [word, [...values][0]!]));
            // A vocabulary a caller cannot read back is worse than none, because the engine
            // reads a block, changes one state and writes it again. The jigsaw's twelve Java
            // orientations share six Bedrock directions, so there is no word to read 0 as.
            if (new Set(vocabulary.values()).size !== vocabulary.size) {
                let keys = unresolved.get(name);
                if (keys === undefined) unresolved.set(name, (keys = new Set()));
                keys.add(key);
                continue;
            }
            // An identity vocabulary says nothing: both editions spell the value the same way.
            if ([...vocabulary].every(([word, value]) => word === String(value))) continue;

            let byKey = vocabularies.get(name);
            if (byKey === undefined) vocabularies.set(name, (byKey = new Map()));
            const existing = byKey.get(key);
            if (existing === undefined) {
                byKey.set(key, vocabulary);
                continue;
            }
            for (const [word, value] of vocabulary) {
                const taken = existing.get(word);
                if (taken === undefined) existing.set(word, value);
                else if (taken !== value) {
                    throw new Error(
                        `${name}.${key}: ${javaId} spells ${word} as ${value}, another block says ${taken}`
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

const lossKeys = new Set(BLOCK_STATE_LOSSES.flatMap((loss) => loss.blocks.map((name) => `${name}.${loss.state}`)));
const observedLossKeys = new Set<string>();
for (const [name, keys] of unresolved) {
    for (const key of keys) {
        if (!lossKeys.has(`${name}.${key}`)) {
            throw new Error(`${name}.${key} is determined by no single Java property and has no reviewed loss entry`);
        }
        observedLossKeys.add(`${name}.${key}`);
    }
}
for (const key of lossKeys) {
    if (!observedLossKeys.has(key)) throw new Error(`${key} is on the loss list but every Java property determines it`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The distinct per-block vocabularies, which 310 blocks share between about thirty of them. */
const distinct: Record<string, Record<string, string | number>>[] = [];
const indexOfVocabulary = new Map<string, number>();
const blocks: Record<string, number> = {};
for (const name of [...vocabularies.keys()].sort()) {
    const byKey = vocabularies.get(name)!;
    const record = Object.fromEntries(
        [...byKey]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, words]) => [key, Object.fromEntries(words)])
    );
    const form = JSON.stringify(record);
    let index = indexOfVocabulary.get(form);
    if (index === undefined) {
        index = distinct.push(record) - 1;
        indexOfVocabulary.set(form, index);
    }
    blocks[name] = index;
}

const render = (value: unknown, depth: number, indent: string): string => {
    if (depth === 0 || value === null || typeof value !== 'object') return JSON.stringify(value);
    const inner = `${indent}    `;
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return `[\n${value.map((item) => inner + render(item, depth - 1, inner)).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries
        .map(([key, item]) => `${inner}${JSON.stringify(key)}: ${render(item, depth - 1, inner)}`)
        .join(',\n')}\n${indent}}`;
};

const table = {
    $notice: [
        'Generated by utils/generate/generate-block-states.ts. Do not edit; regenerate with',
        '`pnpm --filter @jsprismarine/mapping run generate:block-states`.',
        '',
        `How each Bedrock ${blocksTable.bedrockVersion} block spells the state values Java ` +
            `${blocksTable.javaVersion} spells as words, read out of the vendored block mapping ` +
            'table. Blocks that spell every value the way Java does are not listed.',
        '',
        'Derived from GeyserMC/mappings (MIT, Copyright (c) 2019-2026 GeyserMC,',
        'http://geysermc.org); see the NOTICE file beside this package for the full',
        'license text and scope. GeyserMC does not relicense Minecraft, its data, or',
        'any other material owned by Mojang or Microsoft, and neither does this file.'
    ],
    javaVersion: blocksTable.javaVersion,
    bedrockVersion: blocksTable.bedrockVersion,
    vocabularies: distinct,
    blocks
};

const path = join(packageDir, 'src/tables/blockStates.json');
writeFileSync(path, `${render(table, 3, '')}\n`);
console.log(
    `Wrote ${path}: ${Object.keys(blocks).length} blocks over ${distinct.length} distinct vocabularies, ` +
        `${observedLossKeys.size} reviewed (block, state) losses`
);
