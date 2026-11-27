/**
 * Java's legacy solid flag and face sturdiness for a Bedrock block state, which the survival rules
 * of attached blocks, the fluid source rule and the portal floor test read in Java.
 *
 * Neither edition publishes collision or support shapes, so the facts come from running Java's
 * own `BlockState.isSolid` and `isFaceSturdy` over every state of the pinned jar: the
 * `block_support.json` golden in `@jsprismarine/bedrock-data`, copied into this package by
 * `utils/generate/generate-block-support.ts`. The table is keyed by Java state, and a Bedrock state
 * answers with the Java state `bedrockBlockStateToJava` maps it back to, so a stair whose
 * inner or outer shape Bedrock does not keep answers as the straight stair.
 *
 * @javaSee BlockBehaviour$BlockStateBase.isSolid
 * @javaSee BlockBehaviour$BlockStateBase.isFaceSturdy(Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/core/Direction;Lnet/minecraft/world/level/block/SupportType;)Z
 */
import type { BlockStateValue } from './blockStates';
import { BEDROCK_TARGET_STATE_COUNT, bedrockPaletteIndexOf, javaStateSourceAt } from './blockMapping';
import blockSupportJson from './tables/26.3/blockSupport.json';

/** A face of a block, in Java's `Direction` order as the table lists them. */
export type BlockSupportFace = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/**
 * What a face has to hold, Java's `SupportType`: the whole face (`full`), a post in its middle
 * (`center`, a lantern or a hanging bell), or its rim (`rigid`, a rail or a pressure plate).
 */
export type SupportType = 'full' | 'center' | 'rigid';

/** One block's packed values, run-length encoded: a bare value or `[value, count]` runs. */
type SupportRuns = number | readonly (number | readonly [number, number])[];

interface BlockSupportTable {
    javaVersion: string;
    faces: BlockSupportFace[];
    supportTypes: SupportType[];
    blocks: Record<string, SupportRuns>;
}

// The generated table is parsed JSON; the generator writes this shape and the test checks it.
const table = blockSupportJson as unknown as BlockSupportTable;

/** The Java release the support table was dumped from. */
export const BLOCK_SUPPORT_JAVA_VERSION = table.javaVersion;

/** Java's support facts for one Bedrock block state. */
export interface BedrockBlockSupport {
    /**
     * Java's legacy `BlockState.isSolid`: on for a block that forces it, otherwise whether the
     * collision shape's bounds fill most of the cell or its full height. Soul sand, a cactus, a
     * slab and a cobweb are solid; a nether portal block is not.
     */
    readonly solid: boolean;
    /**
     * Whether the block's face holds what a support type needs, as `BlockState.isFaceSturdy` answers.
     *
     * @param face - The face of this block, such as `up` for what stands on it.
     * @param type - What the face has to hold, `full` when left out, as Java's three-argument
     *   overload asks.
     */
    isFaceSturdy(face: BlockSupportFace, type?: SupportType): boolean;
}

/** The bit a face and support type sit at: after the solid flag, one run of faces per type. */
const bitOf = (face: BlockSupportFace, type: SupportType): number =>
    1 << (1 + table.supportTypes.indexOf(type) * table.faces.length + table.faces.indexOf(face));

const SOLID_BIT = 1;

/** One packed value as the facts it stands for. */
class PackedSupport implements BedrockBlockSupport {
    public readonly solid: boolean;
    // A plain field rather than a parameter property: the parity dashboard runs this module
    // through Node's type stripping, which rejects parameter properties.
    private readonly bits: number;

    public constructor(bits: number) {
        this.bits = bits;
        this.solid = (bits & SOLID_BIT) !== 0;
    }

    public isFaceSturdy(face: BlockSupportFace, type: SupportType = 'full'): boolean {
        return (this.bits & bitOf(face, type)) !== 0;
    }
}

/** One instance per distinct packed value; a few hundred values cover every state. */
const byBits = new Map<number, PackedSupport>();
const supportOf = (bits: number): PackedSupport => {
    let support = byBits.get(bits);
    if (support === undefined) {
        support = new PackedSupport(bits);
        byBits.set(bits, support);
    }
    return support;
};

/** One Java state's packed value, from its block's runs. */
const javaStateBits = (runs: SupportRuns, state: number): number | undefined => {
    if (typeof runs === 'number') return runs;
    let remaining = state;
    for (const run of runs) {
        const [value, count] = typeof run === 'number' ? [run, 1] : run;
        if (remaining < count) return value;
        remaining -= count;
    }
    return undefined;
};

/** Unresolved, and resolved to no Java state, in {@link paletteBits}. */
const UNRESOLVED = -1;
const NO_SOURCE = -2;

/** Per palette state, its packed value once asked for. */
const paletteBits = new Int32Array(BEDROCK_TARGET_STATE_COUNT).fill(UNRESOLVED);

/**
 * Java's solid flag and face sturdiness for a Bedrock block state, or undefined for a block no
 * Java state maps onto, which leaves the caller its own rule.
 *
 * @param {string} name - The namespaced Bedrock block identifier, such as `minecraft:stone_slab`.
 * @param {Readonly<Record<string, BlockStateValue>>} [states] - The state's values; without them
 *   the block's first palette state answers.
 * @returns {BedrockBlockSupport | undefined} The facts, or undefined for a Bedrock-only block.
 * @example
 * ```typescript
 * bedrockBlockSupportOf('minecraft:cactus')?.solid; // true
 * bedrockBlockSupportOf('minecraft:stone_slab', { 'minecraft:vertical_half': 'bottom' })?.isFaceSturdy('up'); // false
 * ```
 */
export const bedrockBlockSupportOf = (
    name: string,
    states?: Readonly<Record<string, BlockStateValue>>
): BedrockBlockSupport | undefined => {
    const index = bedrockPaletteIndexOf(name, states);
    if (index === undefined) return undefined;
    let bits = paletteBits[index]!;
    if (bits === UNRESOLVED) {
        const source = javaStateSourceAt(index);
        const runs = source === undefined ? undefined : table.blocks[source.javaId];
        bits =
            (runs === undefined || source === undefined ? undefined : javaStateBits(runs, source.state)) ?? NO_SOURCE;
        paletteBits[index] = bits;
    }
    return bits === NO_SOURCE ? undefined : supportOf(bits);
};
