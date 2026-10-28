/**
 * Writes `src/tables/blockGeometry.json`: whether each block has collision,
 * its fixed partial boxes, its per-state collision shape permutations, the
 * collision height, and the liquid reaction of every block state.
 *
 * The source is `packages/bedrock-data/src/resources/blocks.json`, the
 * CloudburstMC capture of a Bedrock Dedicated Server's own block table, which
 * carries one row per palette state keyed by `blockStateHash` - the same
 * FNV-1a hash of `{name, states}` this server uses as a block's runtime id.
 * The Minecraft palette supplies each state's properties, and the protocol
 * package supplies the hash implementation.
 * Neither Mojang report publishes block shapes and the Java jar's shapes are
 * Java's, so this is the only source for what the Bedrock client will let an
 * entity stand on.
 *
 * Run as `pnpm --filter @jsprismarine/blocks run generate:geometry`. The
 * output is committed, so a palette bump shows up as a reviewable diff.
 *
 * Plain JavaScript over the resource file rather than TypeScript over the
 * built package, for the reason `generate-overlay.mjs` spells out: nothing in
 * `src/` has to be written for `node`'s resolver. The resource is read by
 * path rather than through `@jsprismarine/bedrock-data`, which publishes the
 * capture as a build input rather than as an export; the package script runs
 * `ensure-submodules` first so a missing submodule fails here and loudly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';
import { createServer } from 'vite';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../..');
const source = join(repoRoot, 'packages/bedrock-data/src/resources/blocks.json');
const target = join(packageDir, 'src/tables/blockGeometry.json');

/** How Bedrock's `liquidReactionOnTouch` is written in the table. */
const LIQUID_REACTIONS = {
    BLOCKING: 'blocking',
    POPPED: 'popped',
    BROKEN: 'broken',
    NOREACTION: 'none'
};

/**
 * The lowest surface a box in the cell offers, in blocks above the cell floor.
 *
 * The lowest rather than the highest, because the number answers "what would
 * hold a body up here" and "what has a body got to get its feet over". A
 * stair's two boxes are a bottom slab and a quarter on top of it, so the
 * lowest is the step a mob meets; a fence's one box is 1.5 tall, which is the
 * whole reason a fence pens anything in.
 */
const collisionTop = (row) => {
    const boxes = row.geometry?.collision?.boxes ?? [];
    if (boxes.length === 0) return 0;
    return Math.min(...boxes.map((box) => box[4]));
};

const hasCollision = (row) => (row.geometry?.collision?.boxes ?? []).length > 0;
const collisionBoxes = (row) => row.geometry?.collision?.boxes ?? [];

/** A Molang literal for a value from the captured vanilla block state schema. */
const molangLiteral = (value) => (typeof value === 'string' ? `'${value}'` : String(value));

/**
 * A compact Molang condition for every state in one collision-shape group.
 * Properties shared by all states are dropped, and equal branches are folded
 * into one comparison with `||`.
 */
const conditionForStates = (states, properties, offset = 0) => {
    if (states.length === 0) throw new Error('cannot write a condition for an empty state group');
    if (offset === properties.length) return 'true';

    const [name, property] = properties[offset];
    const byValue = new Map();
    for (const state of states) {
        const value = state.values[name];
        const group = byValue.get(value) ?? [];
        group.push(state);
        byValue.set(value, group);
    }

    const byCondition = new Map();
    for (const [value, group] of byValue) {
        const condition = conditionForStates(group, properties, offset + 1);
        const values = byCondition.get(condition) ?? [];
        values.push(value);
        byCondition.set(condition, values);
    }

    if (byValue.size === property.values.length && byCondition.size === 1) {
        return byCondition.keys().next().value;
    }

    const alternatives = [];
    for (const [condition, values] of byCondition) {
        const checks = values.map((value) => `query.block_state('${name}') == ${molangLiteral(value)}`);
        const stateCondition = checks.length === 1 ? checks[0] : `(${checks.join(' || ')})`;
        alternatives.push(condition === 'true' ? stateCondition : `(${stateCondition}) && (${condition})`);
    }

    return alternatives.length === 1 ? alternatives[0] : `(${alternatives.map((value) => `(${value})`).join(' || ')})`;
};

/** The protocol hashes byte properties as NBT bytes, which its helper models with booleans. */
const hashValuesOf = (properties, values) =>
    Object.fromEntries(
        properties.map(([name, property]) => {
            const value = values[name];
            if (property.type !== 'byte') return [name, value];
            if (value !== 0 && value !== 1) throw new Error(`${name} has a non-boolean byte value ${value}`);
            return [name, value === 1];
        })
    );

/** Every palette state paired with the geometry row its Bedrock runtime hash names. */
const statesOf = (identifier, schema, runtimeIdOf, rowsByHash) => {
    const properties = Object.entries(schema.properties).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
    );
    const states = [];

    const visit = (offset, values) => {
        if (offset === properties.length) {
            const runtimeId = runtimeIdOf(identifier, hashValuesOf(properties, values)) >>> 0;
            const row = rowsByHash.get(runtimeId);
            if (row?.name !== identifier) {
                throw new Error(`${identifier} state ${JSON.stringify(values)} has no captured geometry row`);
            }
            states.push({ values: { ...values }, row, runtimeId });
            return;
        }

        const [name, property] = properties[offset];
        for (const value of property.values) visit(offset + 1, { ...values, [name]: value });
    };

    visit(0, {});
    return { properties, states };
};

const rows = JSON.parse(readFileSync(source, 'utf8'));

const byIdentifier = new Map();
const rowsByHash = new Map();
for (const row of rows) {
    const list = byIdentifier.get(row.name);
    if (list) list.push(row);
    else byIdentifier.set(row.name, [row]);
    rowsByHash.set(row.blockStateHash >>> 0, row);
}

// Use the protocol implementation instead of keeping another copy of its
// byte-for-byte NBT hash in a data generator.
const vite = await createServer({
    root: repoRoot,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom'
});
let blockRuntimeId;
try {
    ({ blockRuntimeId } = await vite.ssrLoadModule('/packages/protocol/src/BlockRuntimeId.ts'));
} finally {
    await vite.close();
}

const blocks = {};
let overrides = 0;
let mappedStateCount = 0;
let collisionPermutationCount = 0;
let collisionPermutationBlockCount = 0;
for (const identifier of [...byIdentifier.keys()].sort()) {
    const sourceStates = byIdentifier.get(identifier);
    const schema = blockSchemas.blocks[identifier];
    let properties = [];
    let states;
    let defaultState;
    if (schema !== undefined) {
        ({ properties, states } = statesOf(identifier, schema, blockRuntimeId, rowsByHash));
        const defaults = Object.fromEntries(
            Object.entries(schema.properties).map(([name, property]) => [name, property.default])
        );
        const defaultHash = blockRuntimeId(identifier, hashValuesOf(properties, defaults)) >>> 0;
        defaultState = states.find((state) => state.runtimeId === defaultHash);
        if (defaultState === undefined) throw new Error(`${identifier} has no default palette state`);
        mappedStateCount += states.length;
    } else {
        states = sourceStates.map((row) => ({ row }));
    }

    // The base is the height most of the block's states share, so the
    // overrides are the handful that differ: which half a slab fills, how
    // deep the snow is, whether the gate is open.
    const counts = new Map();
    for (const { row } of states) counts.set(collisionTop(row), (counts.get(collisionTop(row)) ?? 0) + 1);
    const [base] = [...counts].sort((left, right) => right[1] - left[1])[0];

    const reactions = new Set(states.map(({ row }) => LIQUID_REACTIONS[row.liquidReactionOnTouch]));
    if (reactions.size !== 1) {
        throw new Error(`${identifier} disagrees with itself about liquid: ${[...reactions].join(', ')}`);
    }

    const entry = { top: base, liquid: [...reactions][0], hasCollision: states.some(({ row }) => hasCollision(row)) };

    const shapes = new Map();
    for (const state of states) {
        const boxes = collisionBoxes(state.row);
        const shapeKey = JSON.stringify(boxes);
        const group = shapes.get(shapeKey) ?? { boxes, states: [] };
        group.states.push(state);
        shapes.set(shapeKey, group);
    }

    const defaultBoxes = defaultState === undefined ? undefined : collisionBoxes(defaultState.row);
    const defaultShapeKey = defaultBoxes === undefined ? undefined : JSON.stringify(defaultBoxes);
    const [shapeKey, firstShape] = [...shapes][0];
    if (shapes.size === 1 && shapeKey !== '[]' && shapeKey !== '[[0,0,0,1,1,1]]') {
        entry.collisionBoxes = firstShape.boxes;
    } else if (shapes.size > 1 && defaultBoxes !== undefined) {
        entry.collisionDefaultBoxes = defaultBoxes;
        entry.collisionPermutations = [...shapes.entries()]
            .filter(([key]) => key !== defaultShapeKey)
            .map(([, group]) => ({
                condition: conditionForStates(group.states, properties),
                boxes: group.boxes
            }));
        collisionPermutationCount += entry.collisionPermutations.length;
        collisionPermutationBlockCount += 1;
    } else if (shapes.size > 1) {
        throw new Error(`${identifier} has state-varying geometry but no vanilla state schema`);
    }

    const differing = states.filter(({ row }) => collisionTop(row) !== base);
    if (differing.length > 0) {
        entry.states = {};
        // Ascending, so the diff of a palette bump is stable.
        for (const { row } of differing.sort(
            (left, right) => (left.runtimeId ?? left.row.blockStateHash) - (right.runtimeId ?? right.row.blockStateHash)
        )) {
            entry.states[row.blockStateHash >>> 0] = collisionTop(row);
        }
        overrides += differing.length;
    }

    blocks[identifier] = entry;
}

const table = {
    $comment:
        'Generated by utils/generate-geometry.mjs from packages/bedrock-data/src/resources/blocks.json. Do not edit. ' +
        'Per-state keys are the FNV-1a block runtime id as an unsigned 32-bit number. hasCollision means at least one state has a collision box. collisionBoxes appears for a fixed non-default shape; collisionDefaultBoxes and collisionPermutations appear for state-varying shapes.',
    stateCount: rows.length,
    paletteStateCount: mappedStateCount,
    blockCount: Object.keys(blocks).length,
    blocks
};

if (mappedStateCount !== blockSchemas.stateCount) {
    throw new Error(`mapped ${mappedStateCount} palette states, expected ${blockSchemas.stateCount}`);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(table, null, 4)}\n`);

const washed = Object.values(blocks).filter((entry) => entry.liquid !== 'blocking').length;
console.log(`blockGeometry: ${table.blockCount} blocks over ${table.stateCount} states`);
console.log(`${overrides} per-state collision-height overrides, ${washed} blocks a liquid takes the place of`);
console.log(`${collisionPermutationCount} collision permutations across ${collisionPermutationBlockCount} blocks`);
