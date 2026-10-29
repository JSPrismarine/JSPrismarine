/**
 * Generates `src/tables/blockProperties.json`: the Java-sourced per-state block
 * property table keyed by Bedrock block state, which is the server's identity
 * (plan section 7, the flattening paragraph; section 14 slice 4).
 *
 * The inputs are all committed, so this generator needs no fetched sources:
 * the Java 26.3 per-state property golden in `@jsprismarine/bedrock-data`,
 * this package's vendored block mapping table, and the pinned BDS palette
 * snapshot. For every Java block state it computes the state's property row
 * (base values plus the golden's `stateOverrides`) and assigns it to the
 * Bedrock state `javaBlockStateToBedrock` resolves. Where several Java states
 * collapse onto one Bedrock state their rows must agree; a field two sources
 * disagree on keeps the value of the source nearest the block's default state
 * and lands in `conflicts` for review. Bedrock palette blocks no Java state
 * reaches land in `bedrockOnly` and keep their engine values.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

interface BlocksTable {
    javaVersion: string;
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

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The property fields the flattening carries, all from the Java dump. */
interface PropertyRow {
    hardness: number;
    blastResistance: number;
    friction: number;
    lightEmission: number;
    lightDampening: number;
    requiresCorrectTool: boolean;
    randomTick: boolean;
    pushReaction: string;
    igniteOdds: number;
    burnOdds: number;
}

const FIELDS = [
    'hardness',
    'blastResistance',
    'friction',
    'lightEmission',
    'lightDampening',
    'requiresCorrectTool',
    'randomTick',
    'pushReaction',
    'igniteOdds',
    'burnOdds'
] as const;

interface GoldenEntry {
    stateCount: number;
    base: Record<string, number | string | boolean>;
    stateOverrides?: Record<string, Record<string, number | string | boolean>>;
}

// The golden is parsed JSON; `javaGoldens.test.ts` in bedrock-data verifies this shape.
const golden = readJson(join(repoRoot, 'packages/bedrock-data/src/jsp/java/block_properties.json')) as Record<
    string,
    GoldenEntry
>;

interface PaletteFile {
    minecraftVersion: string;
    states: Record<string, string[]>;
}

// The repository's own BDS capture; see packages/minecraft/datagen/README-palette.md.
const palette = readJson(blockPaletteSnapshotPath()) as PaletteFile;

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

/** The property row of one Java block state: the base row plus every matching override. */
const rowOf = (entry: GoldenEntry, properties: Record<string, string>): PropertyRow => {
    const merged: Record<string, number | string | boolean> = { ...entry.base };
    for (const [stateKey, override] of Object.entries(entry.stateOverrides ?? {})) {
        const matches = stateKey.split(',').every((pair) => {
            const [property, value] = pair.split('=');
            return property !== undefined && properties[property] === value;
        });
        if (matches) Object.assign(merged, override);
    }
    const row = Object.fromEntries(FIELDS.map((field) => [field, merged[field]]));
    // The golden's base rows carry every field with the right type, so the pick is total.
    return row as PropertyRow;
};

/** Canonical body of a Bedrock state's values, the override key: `key=value` pairs, sorted. */
const stateKeyOf = (states: Readonly<Record<string, string | number>>): string =>
    Object.keys(states)
        .sort()
        .map((key) => `${key}=${states[key]}`)
        .join(',');

interface Conflict {
    bedrock: string;
    field: string;
    kept: number | string | boolean;
    keptSource: string;
    other: number | string | boolean;
    otherSource: string;
}

/** One Java state's claim on a Bedrock state: its row, where it came from, and how far off default it is. */
interface Candidate {
    name: string;
    stateKey: string;
    row: PropertyRow;
    source: string;
    /**
     * How many of the Java state's properties hold something other than the block's default
     * value.
     *
     * The Java states that collapse onto one Bedrock state differ only in properties Bedrock
     * does not carry, so this ranks them by how many of those dropped properties are off their
     * defaults, and the lowest rank wins the collapse. First-seen order decided before, and
     * Java lists a boolean property's `true` ahead of its `false`, so every piston kept the
     * extended state's `lightDampening` of 0 where a Bedrock piston, retracted unless it is
     * firing, dampens the full 15.
     */
    rank: number;
}

const candidates = new Map<string, Candidate[]>();
const conflicts: Conflict[] = [];
const seenConflicts = new Set<string>();

/**
 * Waterlogged Java states, held back until every dry state has claimed its target. Bedrock carries
 * waterlogging in the second block layer, so a waterlogged state normally collapses onto the same
 * Bedrock state as its dry twin, whose row describes the block itself; the wet row folds the
 * water's light dampening in and is dropped. The exception is a block whose waterlogging is
 * semantic rather than layered - the sea pickle only glows underwater, and its wet states map to
 * Bedrock states no dry state reaches - so a wet row is kept when its target is otherwise vacant.
 */
const deferredWet: { canonical: string; value: Candidate }[] = [];

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

for (const [javaId, block] of Object.entries(blocksTable.blocks)) {
    const entry = golden[javaId];
    if (entry === undefined) throw new Error(`${javaId} is in the mapping table but not in the property golden`);

    const axes = Object.entries(block.properties ?? {});
    const total = axes.reduce((product, [, values]) => product * values.length, 1);
    if (total !== entry.stateCount) {
        throw new Error(`${javaId}: mapping table has ${total} states, golden has ${entry.stateCount}`);
    }

    const targets: number[] = [];
    for (const run of block.targets) {
        if (typeof run === 'number') targets.push(run);
        else for (let count = 0; count < run[1]; count++) targets.push(run[0]);
    }
    if (targets.length !== total) throw new Error(`${javaId}: ${targets.length} targets over ${total} states`);

    const defaults = propertiesAt(axes, block.default);

    for (let index = 0; index < total; index++) {
        const properties = propertiesAt(axes, index);

        const target = targetPalette[targets[index]!];
        if (target === undefined) throw new Error(`${javaId} state ${index} has no Bedrock target`);

        const row = rowOf(entry, properties);
        const stateKey = stateKeyOf(target.states);
        const canonical = stateKey === '' ? target.name : `${target.name}[${stateKey}]`;
        const source = `${javaId}[${stateKeyOf(properties)}]`;
        const rank = Object.keys(properties).filter((property) => properties[property] !== defaults[property]).length;
        const candidate: Candidate = { name: target.name, stateKey, row, source, rank };

        if (properties['waterlogged'] === 'true') {
            deferredWet.push({ canonical, value: candidate });
            continue;
        }

        const claimed = candidates.get(canonical);
        if (claimed === undefined) candidates.set(canonical, [candidate]);
        else claimed.push(candidate);
    }
}

for (const { canonical, value } of deferredWet) {
    if (!candidates.has(canonical)) candidates.set(canonical, [value]);
}

/** One resolved Bedrock state: the winning row and which Java state supplied it. */
interface Accumulated {
    name: string;
    stateKey: string;
    row: PropertyRow;
}

const accumulated = new Map<string, Accumulated>();
for (const [canonical, claimed] of candidates) {
    let winner = claimed[0]!;
    for (const candidate of claimed) {
        if (candidate.rank < winner.rank) winner = candidate;
    }

    const row: PropertyRow = { ...winner.row };
    for (const candidate of claimed) {
        if (candidate === winner) continue;
        for (const field of FIELDS) {
            if (candidate.row[field] === winner.row[field]) continue;

            // A Bedrock state must random-tick when any of its Java sources does: the collapsed
            // property (leaf distance, bamboo stage) is one the server recomputes, so the state
            // has to reach the ticker for the recomputation to run at all. Every other field
            // keeps the winning source's value and stays in `conflicts` for review.
            const ticking = field === 'randomTick';
            if (ticking) row.randomTick = true;
            const keeper = ticking && !winner.row.randomTick ? candidate : winner;
            const other = keeper === winner ? candidate : winner;

            const dedupeKey = `${canonical} ${field} ${keeper.row[field]} ${other.row[field]}`;
            if (seenConflicts.has(dedupeKey)) continue;
            seenConflicts.add(dedupeKey);
            conflicts.push({
                bedrock: canonical,
                field,
                kept: keeper.row[field],
                keptSource: keeper.source,
                other: other.row[field],
                otherSource: other.source
            });
        }
    }

    accumulated.set(canonical, { name: winner.name, stateKey: winner.stateKey, row });
}

// ---------------------------------------------------------------------------
// Grouping per Bedrock block, base row by field-wise majority
// ---------------------------------------------------------------------------

const byName = new Map<string, Accumulated[]>();
for (const state of accumulated.values()) {
    const list = byName.get(state.name) ?? [];
    list.push(state);
    byName.set(state.name, list);
}

interface BlockRow {
    base: PropertyRow;
    stateOverrides?: Record<string, Partial<PropertyRow>>;
}

const blocks: Record<string, BlockRow> = {};
for (const name of [...byName.keys()].sort()) {
    const states = byName.get(name)!;

    const base: Record<string, number | string | boolean> = {};
    for (const field of FIELDS) {
        const counts = new Map<number | string | boolean, number>();
        for (const state of states) {
            counts.set(state.row[field], (counts.get(state.row[field]) ?? 0) + 1);
        }
        let winner = states[0]!.row[field];
        let best = 0;
        for (const [value, count] of counts) {
            if (count > best) {
                winner = value;
                best = count;
            }
        }
        base[field] = winner;
    }

    const stateOverrides: Record<string, Partial<PropertyRow>> = {};
    for (const state of states) {
        const diff: Record<string, number | string | boolean> = {};
        for (const field of FIELDS) {
            if (state.row[field] !== base[field]) diff[field] = state.row[field];
        }
        if (Object.keys(diff).length > 0) stateOverrides[state.stateKey] = diff;
    }

    // The field-wise picks above come from PropertyRow values, so the shapes hold.
    const row: BlockRow = { base: base as PropertyRow };
    if (Object.keys(stateOverrides).length > 0)
        row.stateOverrides = stateOverrides as Record<string, Partial<PropertyRow>>;
    blocks[name] = row;
}

const bedrockOnly = Object.keys(palette.states)
    .filter((name) => !byName.has(name))
    .sort();

for (const name of byName.keys()) {
    if (!(name in palette.states)) throw new Error(`${name} is not in the ${palette.minecraftVersion} palette`);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

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
        'Generated by utils/generate/generate-block-properties.ts. Do not edit; regenerate with',
        '`pnpm --filter @jsprismarine/mapping run generate:block-properties`.',
        '',
        `Java ${blocksTable.javaVersion} per-state block properties flattened onto Bedrock ` +
            `${palette.minecraftVersion} block states through the vendored block mapping table. ` +
            'The property values come from the Java jar dump golden in @jsprismarine/bedrock-data.'
    ],
    javaVersion: blocksTable.javaVersion,
    bedrockVersion: palette.minecraftVersion,
    blocks,
    bedrockOnly,
    conflicts
};

const path = join(packageDir, 'src/tables/blockProperties.json');
writeFileSync(path, `${render(table, 3, '')}\n`);
console.log(
    `Wrote ${path}: ${Object.keys(blocks).length} blocks over ${accumulated.size} states, ` +
        `${bedrockOnly.length} Bedrock-only blocks, ${conflicts.length} collapse conflicts`
);
