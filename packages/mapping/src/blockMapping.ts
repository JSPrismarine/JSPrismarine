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
