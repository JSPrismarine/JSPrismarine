import { blocksTable } from '@jsprismarine/mapping/tables';

/**
 * Walks Java 26.3's block registry one state at a time.
 *
 * The property axes come from the mapping table, which is the only place in the repository
 * that records which values each Java property takes. The comparisons that use this check the
 * walk against the Java jar dump's own `stateCount` per block, so a table that lost an axis
 * shows up as a count gap rather than as a quietly shorter walk.
 */

/** One Java block state: the identifier, its property values and its index within the block. */
export interface JavaBlockState {
    javaId: string;
    /** The property values, keyed by Java property name. */
    values: Record<string, string>;
    /** The state's index within its block, in Java's own axis order. */
    index: number;
    /** The key the Java property dump writes its per-state overrides under, such as `age=3,lit=true`. */
    key: string;
    /** Whether every property is at the value Java's default block state carries. */
    isDefault: boolean;
}

/** One Java block with its property axes and the index of its default state. */
interface JavaBlockAxes {
    javaId: string;
    axes: [string, string[]][];
    stateCount: number;
    defaultIndex: number;
}

const blockAxes = (): JavaBlockAxes[] =>
    Object.entries(blocksTable.blocks).map(([javaId, entry]) => {
        const axes = Object.entries(entry.properties ?? {});
        return {
            javaId,
            axes,
            stateCount: axes.reduce((product, [, values]) => product * values.length, 1),
            defaultIndex: entry.default
        };
    });

/** Decomposes a state index into property values, least significant axis last, as Java does. */
const valuesAt = (axes: readonly [string, string[]][], index: number): Record<string, string> => {
    const values: Record<string, string> = {};
    let remainder = index;
    for (let axis = axes.length - 1; axis >= 0; axis--) {
        const [property, domain] = axes[axis]!;
        values[property] = domain[remainder % domain.length]!;
        remainder = Math.floor(remainder / domain.length);
    }
    return values;
};

/** The key the Java property dump writes a state's overrides under: properties sorted by name. */
export const javaStateKey = (values: Readonly<Record<string, string>>): string =>
    Object.keys(values)
        .sort()
        .map((property) => `${property}=${values[property]}`)
        .join(',');

/** How many block states Java's registry holds for each block, by identifier. */
export const javaStateCounts = (): ReadonlyMap<string, number> =>
    new Map(blockAxes().map((block) => [block.javaId, block.stateCount]));

/** Every Java block state in registry order. */
export function* loadJavaBlockStates(): Generator<JavaBlockState> {
    for (const block of blockAxes()) {
        for (let index = 0; index < block.stateCount; index++) {
            const values = valuesAt(block.axes, index);
            yield {
                javaId: block.javaId,
                values,
                index,
                key: javaStateKey(values),
                isDefault: index === block.defaultIndex
            };
        }
    }
}

/** The property values of each block's default state, by identifier. */
export const javaDefaultStates = (): ReadonlyMap<string, Record<string, string>> =>
    new Map(blockAxes().map((block) => [block.javaId, valuesAt(block.axes, block.defaultIndex)]));
