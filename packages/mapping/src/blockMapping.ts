import type { BlockStateValue } from './blockStates';
import type { BlockLoss } from './lossList';
import { BLOCK_LOSSES } from './lossList';
import { blocksTable } from './tables';

/** One Bedrock block state: the identifier and the exact state set its palette entry declares. */
export interface BedrockBlockState {
    /** The namespaced Bedrock block identifier. */
    readonly name: string;
    /** The Bedrock state values, exactly the keys the pinned palette declares for the identifier. */
    readonly states: Readonly<Record<string, string | number>>;
}

/** What a Java block state lookup produced. */
export type BlockMappingResult =
    /** A real Bedrock palette state with nothing lost at the block level. */
    | { readonly kind: 'mapped'; readonly bedrock: BedrockBlockState }
    /** A reviewed loss: the Java block has no Bedrock concept, and `bedrock` is its listed fallback. */
    | { readonly kind: 'loss'; readonly loss: BlockLoss; readonly bedrock: BedrockBlockState }
    /** A non-`minecraft:` identifier, passed through untouched for custom content. */
    | { readonly kind: 'passthrough'; readonly bedrock: BedrockBlockState }
    /** Not a Java 26.3 block state: an unknown identifier, property or value. */
    | { readonly kind: 'unknown'; readonly javaId: string };

/** The pinned version pair and GeyserMC/mappings commit the tables were generated from. */
export const MAPPING_VERSIONS = {
    javaVersion: blocksTable.javaVersion,
    bedrockVersion: blocksTable.bedrockVersion,
    geyserMappingsCommit: blocksTable.geyserMappingsCommit
} as const;

const palette: BedrockBlockState[] = blocksTable.statePalette.flatMap(([name, keys, tuples]) =>
    tuples.map((values) => ({
        name: `minecraft:${name}`,
        states: Object.freeze(Object.fromEntries(keys.map((key, axis) => [key, values[axis] ?? ''])))
    }))
);

const expandedTargets = new Map<string, Uint16Array>();
const targetsOf = (javaId: string): Uint16Array => {
    let expanded = expandedTargets.get(javaId);
    if (expanded === undefined) {
        const runs = blocksTable.blocks[javaId]?.targets ?? [];
        const flat: number[] = [];
        for (const run of runs) {
            if (typeof run === 'number') flat.push(run);
            else for (let count = 0; count < run[1]; count++) flat.push(run[0]);
        }
        expanded = Uint16Array.from(flat);
        expandedTargets.set(javaId, expanded);
    }
    return expanded;
};

const blockLossById = new Map<string, BlockLoss>(BLOCK_LOSSES.map((loss) => [loss.javaId, loss]));

/**
 * Maps one Java 26.3 block state to its Bedrock 1.26.51 palette state. Total
 * over all 35723 Java states: every valid state returns `mapped` or a
 * reviewed `loss`, never `undefined`.
 *
 * Omitted properties take the block's default state values, as Java does.
 * Non-`minecraft:` identifiers pass through untouched. Anything that is not
 * a Java block state at the pinned version returns `unknown`.
 */
export const javaBlockStateToBedrock = (
    javaId: string,
    properties?: Readonly<Record<string, string>>
): BlockMappingResult => {
    if (!javaId.startsWith('minecraft:')) {
        return { kind: 'passthrough', bedrock: { name: javaId, states: { ...(properties ?? {}) } } };
    }
    const block = blocksTable.blocks[javaId];
    if (block === undefined) return { kind: 'unknown', javaId };

    const axes = Object.entries(block.properties ?? {});
    let index = 0;
    let defaultRemainder = block.default;
    // Walk the axes most significant first; the default state supplies any
    // omitted value, decomposed from the default state's in-block index.
    let defaultDivisor = axes.reduce((product, [, values]) => product * values.length, 1);
    for (const [property, values] of axes) {
        defaultDivisor /= values.length;
        const defaultValueIndex = Math.floor(defaultRemainder / defaultDivisor);
        defaultRemainder %= defaultDivisor;
        const provided = properties?.[property];
        const valueIndex = provided === undefined ? defaultValueIndex : values.indexOf(provided);
        if (valueIndex < 0) return { kind: 'unknown', javaId };
        index = index * values.length + valueIndex;
    }
    for (const property of Object.keys(properties ?? {})) {
        if (!axes.some(([name]) => name === property)) return { kind: 'unknown', javaId };
    }

    const bedrock = palette[targetsOf(javaId)[index] ?? -1];
    if (bedrock === undefined) return { kind: 'unknown', javaId };
    const loss = blockLossById.get(javaId);
    if (loss !== undefined) return { kind: 'loss', loss, bedrock };
    return { kind: 'mapped', bedrock };
};

/** The number of distinct Bedrock states the Java palette reaches; exposed for the parity dashboard. */
export const BEDROCK_TARGET_STATE_COUNT = palette.length;

/** One Java 26.3 block state: the identifier and a value for every property the block declares. */
export interface JavaBlockState {
    /** The namespaced Java block identifier, such as `minecraft:black_concrete_slab`. */
    readonly name: string;
    /** Every property the Java block declares, each at the value this state names. */
    readonly properties: Readonly<Record<string, string>>;
}

/** What a Bedrock block state lookup produced. */
export type JavaMappingResult =
    /** A Java 26.3 block state that maps onto the Bedrock state asked about. */
    | { readonly kind: 'mapped'; readonly java: JavaBlockState }
    /** A Bedrock identifier no Java block state reaches, which is every Bedrock-only block. */
    | { readonly kind: 'unknown'; readonly bedrockId: string };

/** Where one Bedrock identifier's states sit in {@link palette}, and how its palette entry spells them. */
interface PaletteBlock {
    /** Index into {@link palette} of the identifier's first state. */
    readonly first: number;
    /** The state names, in the order the value tuples list them. */
    readonly keys: readonly string[];
    /** One value tuple per state of the identifier. */
    readonly tuples: readonly (readonly (string | number)[])[];
}

// Walks `statePalette` in the order `palette` flattened it, so `first` indexes the same array.
const paletteBlocks = new Map<string, PaletteBlock>();
let paletteCursor = 0;
for (const [name, keys, tuples] of blocksTable.statePalette) {
    paletteBlocks.set(`minecraft:${name}`, { first: paletteCursor, keys, tuples });
    paletteCursor += tuples.length;
}

/** The Java sources of every palette state, built on first use because most servers never ask. */
interface JavaSources {
    /** Java block ids in table order, which is alphabetical; the arrays below index this. */
    readonly javaIds: readonly string[];
    /** Per palette state, the index into `javaIds` of the Java block that reaches it, or -1. */
    readonly blocks: Int16Array;
    /** Per palette state, the in-block state index of the Java state that reaches it. */
    readonly states: Uint16Array;
    /** Per Bedrock identifier, every Java block any of its states maps from, in `javaIds` order. */
    readonly byBedrock: ReadonlyMap<string, readonly string[]>;
}

let javaSources: JavaSources | undefined;

/** The number of axes an in-block state index spells the same way the block's default state does. */
const defaultAgreement = (state: number, sizes: readonly number[], defaults: readonly number[]): number => {
    let agreed = 0;
    let remainder = state;
    for (let axis = sizes.length - 1; axis >= 0; axis--) {
        const size = sizes[axis]!;
        if (remainder % size === defaults[axis]) agreed++;
        remainder = Math.floor(remainder / size);
    }
    return agreed;
};

/** The per-axis value indices of one in-block state index. */
const axisIndices = (state: number, sizes: readonly number[]): number[] => {
    const indices = new Array<number>(sizes.length);
    let remainder = state;
    for (let axis = sizes.length - 1; axis >= 0; axis--) {
        const size = sizes[axis]!;
        indices[axis] = remainder % size;
        remainder = Math.floor(remainder / size);
    }
    return indices;
};

/**
 * Inverts the whole block table in one pass.
 *
 * Several Java states can land on one Bedrock state, because Bedrock drops properties Java
 * carries: a waterlogged slab and a dry one are one Bedrock block, since Bedrock puts the water
 * in a layer of its own. Two rules pick which of them the inverse reports. The first Java block
 * in table order claims the state, which makes the answer alphabetical rather than dependent on
 * when a caller asked. Within that block, the state agreeing with Java's default on the most
 * axes wins, so a dropped property comes back at the value Java would have filled in for a
 * caller who left it out.
 */
const sourcesOf = (): JavaSources => {
    if (javaSources !== undefined) return javaSources;

    const javaIds = Object.keys(blocksTable.blocks);
    const blocks = new Int16Array(palette.length).fill(-1);
    const states = new Uint16Array(palette.length);
    const agreements = new Int8Array(palette.length);
    const byBedrock = new Map<string, string[]>();

    for (let block = 0; block < javaIds.length; block++) {
        const javaId = javaIds[block]!;
        const entry = blocksTable.blocks[javaId]!;
        const sizes = Object.values(entry.properties ?? {}).map((values) => values.length);
        const defaults = axisIndices(entry.default, sizes);
        const targets = targetsOf(javaId);

        for (let state = 0; state < targets.length; state++) {
            const target = targets[state]!;
            const agreed = defaultAgreement(state, sizes, defaults);
            if (blocks[target] === -1 || (blocks[target] === block && agreed > agreements[target]!)) {
                blocks[target] = block;
                states[target] = state;
                agreements[target] = agreed;
            }

            const bedrockId = palette[target]?.name;
            if (bedrockId === undefined) continue;
            const reached = byBedrock.get(bedrockId);
            if (reached === undefined) byBedrock.set(bedrockId, [javaId]);
            else if (reached[reached.length - 1] !== javaId) reached.push(javaId);
        }
    }

    javaSources = { javaIds, blocks, states, byBedrock };
    return javaSources;
};

/** Decomposes an in-block state index back into the property values the forward direction composed it from. */
const propertiesOf = (javaId: string, state: number): Record<string, string> => {
    const axes = Object.entries(blocksTable.blocks[javaId]?.properties ?? {});
    const indices = axisIndices(
        state,
        axes.map(([, values]) => values.length)
    );
    return Object.fromEntries(axes.map(([property, values], axis) => [property, values[indices[axis]!]!]));
};

/** The offset into a Bedrock block's palette states that the given values name. */
const offsetOf = (block: PaletteBlock, states: Readonly<Record<string, BlockStateValue>> | undefined): number => {
    if (states === undefined) return 0;

    // The palette carries booleans as 0 and 1, so a caller holding `true` still matches.
    const wanted = block.keys.map((key) => {
        const value = states[key];
        return value === undefined ? undefined : String(typeof value === 'boolean' ? Number(value) : value);
    });
    const found = block.tuples.findIndex((tuple) =>
        wanted.every((value, axis) => value === undefined || value === String(tuple[axis]))
    );
    return found < 0 ? 0 : found;
};

/**
 * Maps one Bedrock block state back to the Java 26.3 state it came from, the inverse of
 * {@link javaBlockStateToBedrock}.
 *
 * The states matter, because Bedrock splits blocks Java keeps whole and keeps blocks Java
 * splits. A `minecraft:black_concrete_double_slab` is Java's `black_concrete_slab` at
 * `type=double`, and a `minecraft:torch` facing a wall is Java's `wall_torch` rather than its
 * `torch`. Nothing but the state can tell those apart.
 *
 * Where several Java states collapse onto one Bedrock state, the answer is the first in
 * alphabetical Java block order, at the value Java's default state gives each property Bedrock
 * dropped. A waterlogged slab comes back dry, because Bedrock holds the water in a layer of its
 * own and nothing in the state can say otherwise. That is the information
 * {@link import('./lossList').DROPPED_BLOCK_PROPERTIES} records as lost.
 *
 * @param {string} bedrockId - The namespaced Bedrock block identifier.
 * @param {Readonly<Record<string, BlockStateValue>>} [states] - The state values as the palette
 *   holds them. A name the block does not carry is ignored, and a set of values that names no
 *   state of the block falls back to the block's first palette state. Omitting them altogether
 *   answers for that first state.
 * @returns {JavaMappingResult} The Java state, or `unknown` for an identifier no Java block reaches.
 * @example
 * ```typescript
 * bedrockBlockStateToJava('minecraft:black_concrete_double_slab');
 * // { kind: 'mapped', java: { name: 'minecraft:black_concrete_slab', properties: { type: 'double', waterlogged: 'false' } } }
 * ```
 */
export const bedrockBlockStateToJava = (
    bedrockId: string,
    states?: Readonly<Record<string, BlockStateValue>>
): JavaMappingResult => {
    const block = paletteBlocks.get(bedrockId);
    if (block === undefined) return { kind: 'unknown', bedrockId };

    const sources = sourcesOf();
    const index = block.first + offsetOf(block, states);
    const javaId = sources.javaIds[sources.blocks[index] ?? -1];
    if (javaId === undefined) return { kind: 'unknown', bedrockId };

    return { kind: 'mapped', java: { name: javaId, properties: propertiesOf(javaId, sources.states[index]!) } };
};

/**
 * Every Java 26.3 block that some state of a Bedrock block maps from, in alphabetical order.
 *
 * The list has more than one member wherever Java splits a block Bedrock keeps whole: Bedrock's
 * one `minecraft:torch` answers `minecraft:torch` and `minecraft:wall_torch`, and its one
 * `minecraft:air` answers all three of Java's air blocks. Use it when a per-state answer is not
 * enough, such as finding the one Java block of the set that a datapack registered something for.
 *
 * @param {string} bedrockId - The namespaced Bedrock block identifier.
 * @returns {readonly string[]} The Java block ids, empty for a Bedrock-only block.
 * @example
 * ```typescript
 * bedrockBlockToJava('minecraft:torch'); // ['minecraft:torch', 'minecraft:wall_torch']
 * ```
 */
export const bedrockBlockToJava = (bedrockId: string): readonly string[] => sourcesOf().byBedrock.get(bedrockId) ?? [];
