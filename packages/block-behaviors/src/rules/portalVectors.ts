/**
 * Replays the portal creation vectors Java computed against the port.
 *
 * `utils/oracle/DumpPortalVectors.java` runs `PortalForcer.createPortal` from the pinned jar in a set of
 * fixed block layouts and writes `vectors/<release>/portal-creation.json`: each layout as cuboid
 * fills, the target and axis, the origin Java chose and every block it wrote, and the four block
 * rules the search reads for each block the layouts use. {@link replayPortalVector} rebuilds a
 * layout in a {@link VoxelDimension}, runs {@link portalCreationSite} and {@link writeNetherPortal}
 * in it and reports where the result differs from Java's. The package's own test and the parity
 * suite's `blocks.portals` row both read the vectors through it.
 *
 * Java names map to Bedrock through `@jsprismarine/mapping`. Each block's push reaction comes
 * from the same Java-sourced table the server's overlay is generated from, and the
 * `MOTION_BLOCKING` heightmap tag from Java's own answer for the block, so the replay sees the
 * blocks the way the server does.
 */
import type { BlockPosition, BlockStateValue } from '@jsprismarine/blocks';
import { bedrockBlockPropertiesOf, javaBlockStateToBedrock } from '@jsprismarine/mapping';

import { isLiquid, isReplaceable } from '../identifiers';
import { VoxelDimension } from '../voxelWorld';
import type { BlockStates } from '../world';
import type { PortalAxis, PortalCreationBounds, PortalWorldBorder } from './portal';
import { BLOCKS_MOTION_IN_HEIGHTMAP_TAG, NETHERRACK, portalCreationSite, writeNetherPortal } from './portal';
import { isSolidSupport } from './support';

/** The block rules Java's search reads for one block, as the dump records them. */
export interface JavaPortalBlockRules {
    /** `BlockState.canBeReplaced`. */
    readonly canBeReplaced: boolean;
    /** `BlockState.isSolid`, which `canHostFrame` asks of the floor. */
    readonly isSolid: boolean;
    /** Whether the block holds a fluid. */
    readonly hasFluid: boolean;
    /** Whether `Heightmap.Types.MOTION_BLOCKING` stands on the block. */
    readonly motionBlocking: boolean;
}

/** One layout Java built a portal in, as the dump writes it. */
export interface PortalVectorCase {
    readonly name: string;
    /** The dimension's floor, height and logical height, as its dimension type gives them. */
    readonly dimension: {
        readonly name: string;
        readonly minY: number;
        readonly height: number;
        readonly logicalHeight: number;
    };
    /** The world border's extent, absent when the layout keeps Java's default border. */
    readonly border?: PortalWorldBorder;
    /** Cuboids of one Java block each, corners inclusive, applied in order over air. */
    readonly fills: readonly {
        readonly from: readonly number[];
        readonly to: readonly number[];
        readonly block: string;
    }[];
    readonly target: readonly number[];
    readonly axis: string;
    /** The bottom-left interior block Java chose, or null when it built nothing. */
    readonly origin: readonly number[] | null;
    /** Every block Java wrote, in order, with the portal block's axis. */
    readonly writes: readonly { readonly at: readonly number[]; readonly block: string; readonly axis?: string }[];
}

/** The whole vector file. */
export interface PortalVectorFile {
    readonly javaVersion: string;
    readonly blockRules: Readonly<Record<string, JavaPortalBlockRules>>;
    readonly cases: readonly PortalVectorCase[];
}

/** How the port's answer for one layout compares with Java's. */
export interface PortalVectorReplay {
    /** The bottom-left interior block the port chose, or null when it built nothing. */
    readonly origin: readonly number[] | null;
    /**
     * Each way the port's result differs from Java's, apart from the netherrack below: a different
     * origin, a position whose final block differs, or a Java block with no Bedrock state.
     */
    readonly differences: readonly string[];
    /**
     * The positions only the port wrote, each with netherrack: the flanks Bedrock adds beside a
     * forced portal's obsidian platform, which Java does not write.
     */
    readonly netherrackFlanks: readonly string[];
}

const keyOf = (position: BlockPosition): string => `${position.x},${position.y},${position.z}`;

/** A position from the dump's `[x, y, z]`. */
const positionOf = (xyz: readonly number[]): BlockPosition => ({ x: xyz[0] ?? 0, y: xyz[1] ?? 0, z: xyz[2] ?? 0 });

/** A block and its states, written so that two equal blocks compare equal as strings. */
const describe = (name: string, states: Readonly<Record<string, BlockStateValue>> = {}): string => {
    const entries = Object.entries(states).sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? name : `${name}[${entries.map(([key, value]) => `${key}=${value}`).join(',')}]`;
};

/** The Bedrock state a Java block, with its properties, maps to. */
const bedrockOf = (
    javaName: string,
    properties?: Readonly<Record<string, string>>
): { readonly name: string; readonly states: BlockStates } | undefined => {
    const mapped = javaBlockStateToBedrock(javaName, properties);
    return mapped.kind === 'unknown' ? undefined : mapped.bedrock;
};

const isPortalAxis = (axis: string): axis is PortalAxis => axis === 'x' || axis === 'z';

/** A voxel dimension that remembers the last block written to each position. */
class RecordingDimension extends VoxelDimension {
    public readonly written = new Map<string, string>();

    public override setBlock(position: BlockPosition, identifier: string, states: BlockStates = {}): void {
        this.written.set(keyOf(position), describe(identifier, states));
        super.setBlock(position, identifier, states);
    }
}

/**
 * A world that classifies blocks as the server does: each block's push reaction from the
 * Java-sourced property table, and the heightmap tag from Java's rules.
 */
const ruledWorld = (dimension: string, rules: PortalVectorFile['blockRules']): RecordingDimension => {
    const world = new RecordingDimension(dimension);
    const motionBlocking: string[] = [];
    for (const [javaName, rule] of Object.entries(rules)) {
        const bedrock = bedrockOf(javaName);
        if (bedrock === undefined) continue;
        // Only a `popped` push reaction changes what `isSolidSupport` answers.
        const popped = bedrockBlockPropertiesOf(bedrock.name)?.pushReaction === 'popped';
        world.defineProperties(bedrock.name, { pushReaction: popped ? 'popped' : 'push_pull' });
        if (rule.motionBlocking && !rule.hasFluid) motionBlocking.push(bedrock.name);
    }
    world.tag(BLOCKS_MOTION_IN_HEIGHTMAP_TAG, ...motionBlocking);
    return world;
};

/** A layout's world: {@link ruledWorld} with the fills written in Bedrock blocks. */
const layoutWorld = (vector: PortalVectorCase, rules: PortalVectorFile['blockRules']): RecordingDimension => {
    const world = ruledWorld(`minecraft:${vector.dimension.name}`, rules);
    for (const fill of vector.fills) {
        const bedrock = bedrockOf(fill.block);
        if (bedrock !== undefined) world.fill(positionOf(fill.from), positionOf(fill.to), bedrock.name, bedrock.states);
    }
    return world;
};

/**
 * Runs the port in one of Java's layouts and compares what it chose and wrote with what Java did.
 *
 * @param rules - The file's `blockRules`, which say how Java classifies each block.
 */
export const replayPortalVector = (
    vector: PortalVectorCase,
    rules: PortalVectorFile['blockRules']
): PortalVectorReplay => {
    if (!isPortalAxis(vector.axis)) {
        return { origin: null, differences: [`axis ${vector.axis} is not a portal axis`], netherrackFlanks: [] };
    }
    const world = layoutWorld(vector, rules);
    const { minY, height, logicalHeight } = vector.dimension;
    const bounds: PortalCreationBounds = {
        minY,
        maxY: minY + Math.min(height, logicalHeight),
        ...(vector.border === undefined ? {} : { border: vector.border })
    };
    const site = portalCreationSite(world, positionOf(vector.target), vector.axis, bounds);
    if (site !== undefined) writeNetherPortal(world, site.at, vector.axis, site.forced);
    const origin = site === undefined ? null : [site.at.x, site.at.y, site.at.z];

    const differences: string[] = [];
    if (JSON.stringify(origin) !== JSON.stringify(vector.origin)) {
        differences.push(`origin ${JSON.stringify(origin)}, Java ${JSON.stringify(vector.origin)}`);
    }

    const javaWritten = new Map<string, string>();
    for (const write of vector.writes) {
        const bedrock = bedrockOf(write.block, write.axis === undefined ? undefined : { axis: write.axis });
        if (bedrock === undefined) differences.push(`${write.block} has no Bedrock state`);
        else javaWritten.set(keyOf(positionOf(write.at)), describe(bedrock.name, bedrock.states));
    }

    const netherrackFlanks: string[] = [];
    for (const [key, java] of javaWritten) {
        const port = world.written.get(key);
        if (port !== java) differences.push(`${key}: ${port ?? 'nothing'}, Java ${java}`);
    }
    for (const [key, port] of world.written) {
        if (javaWritten.has(key)) continue;
        if (port === NETHERRACK) netherrackFlanks.push(key);
        else differences.push(`${key}: ${port}, Java nothing`);
    }
    return { origin, differences, netherrackFlanks };
};

/**
 * Each block whose rules the port answers differently from Java, as `<java name>#<rule>`: whether
 * a portal may replace it (`canBeReplaced` without a fluid), and whether it is a floor
 * (`isSolid`), which the port reads as `isSolidSupport`.
 */
export const portalBlockRuleDifferences = (file: PortalVectorFile): string[] => {
    const world = ruledWorld('minecraft:overworld', file.blockRules);
    const differences: string[] = [];
    for (const [javaName, rule] of Object.entries(file.blockRules)) {
        const bedrock = bedrockOf(javaName);
        if (bedrock === undefined) {
            differences.push(`${javaName}#mapping`);
            continue;
        }
        const at = { x: 0, y: 0, z: 0 };
        world.set(at, bedrock.name, bedrock.states);
        const replaceable = isReplaceable(bedrock.name) && !isLiquid(bedrock.name);
        if (replaceable !== (rule.canBeReplaced && !rule.hasFluid)) differences.push(`${javaName}#canBeReplaced`);
        if (isSolidSupport(world, at) !== rule.isSolid) differences.push(`${javaName}#isSolid`);
    }
    return differences;
};
