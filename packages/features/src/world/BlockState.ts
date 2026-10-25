/**
 * A Java Edition block state: an identifier and the property values that distinguish it from the
 * other states of the same block.
 *
 * Everything this package produces is Java-shaped. Turning a state into the Bedrock palette entry
 * the server stores is `@jsprismarine/mapping`'s job, reached through the
 * {@link import('./FeatureWorld').FeatureWorld} adapter rather than from inside a feature.
 */
export interface BlockState {
    /** The namespaced block identifier, for example `minecraft:oak_log`. */
    readonly name: string;
    /** Property values keyed by name, as strings, exactly as the JSON spells them. */
    readonly properties: Readonly<Record<string, string>>;
}

/** The three fluids a block state can hold, which is all the feature code distinguishes. */
export type FluidKind = 'empty' | 'water' | 'lava';

/** The six block faces, spelled as Java spells a `Direction`. */
export type Direction = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/** The two vertical directions, which `environment_scan` and the speleothem features search along. */
export type VerticalDirection = 'down' | 'up';

/** The unit step of each direction, in Java's axis order. */
export const DIRECTION_STEPS: Readonly<Record<Direction, readonly [number, number, number]>> = {
    down: [0, -1, 0],
    up: [0, 1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    west: [-1, 0, 0],
    east: [1, 0, 0]
};

/** The four compass directions in Java's `Direction.Plane.HORIZONTAL` order. */
export const HORIZONTAL_DIRECTIONS = ['north', 'south', 'west', 'east'] as const satisfies readonly Direction[];

/** Every direction in Java's declaration order, which decides iteration order in several features. */
export const ALL_DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east'] as const satisfies readonly Direction[];

const OPPOSITES = {
    down: 'up',
    up: 'down',
    north: 'south',
    south: 'north',
    west: 'east',
    east: 'west'
} as const satisfies Record<Direction, Direction>;

/** Returns the direction facing the other way. */
export const oppositeDirection = <D extends Direction>(direction: D): (typeof OPPOSITES)[D] => OPPOSITES[direction];

const EMPTY_PROPERTIES: Readonly<Record<string, string>> = Object.freeze({});

/** Builds a block state, sharing one frozen object for the common property-free case. */
export const blockState = (name: string, properties?: Readonly<Record<string, string>>): BlockState => ({
    name,
    properties: properties ?? EMPTY_PROPERTIES
});

/** Returns a copy of `state` with one property set, leaving the original untouched. */
export const withProperty = (state: BlockState, key: string, value: string): BlockState =>
    state.properties[key] === value ? state : blockState(state.name, { ...state.properties, [key]: value });

/** Returns a copy of `state` with several properties set at once. */
export const withProperties = (state: BlockState, values: Readonly<Record<string, string>>): BlockState =>
    blockState(state.name, { ...state.properties, ...values });

/**
 * Returns the canonical text form, `minecraft:oak_log[axis=y]`, with properties in sorted order.
 *
 * Two states are the same state when their keys are equal, which is what the feature code compares
 * instead of walking property maps.
 */
export const blockStateKey = (state: BlockState): string => {
    const keys = Object.keys(state.properties).sort();
    if (keys.length === 0) return state.name;
    return `${state.name}[${keys.map((key) => `${key}=${state.properties[key]}`).join(',')}]`;
};

/** Answers whether two states name the same block, ignoring their properties. */
export const isBlock = (state: BlockState, name: string): boolean => state.name === name;

/** Answers whether two states are identical, properties included. */
export const sameState = (a: BlockState, b: BlockState): boolean => blockStateKey(a) === blockStateKey(b);
