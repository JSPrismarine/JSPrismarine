import table from './tables/stateTransforms.json';
import type { Mirror, Rotation, TransformName } from './tableShape';
import { TRANSFORM_NAMES } from './tableShape';
import type {
    BedrockBlockState,
    BedrockStructureTemplate,
    BedrockTemplateBlock,
    EntityPosition,
    TemplateEntity,
    TemplatePosition
} from './types';

/** One Bedrock identifier's state shape and the permutations that move it. */
interface TransformEntry {
    /** The identifier's state keys, alphabetical, which is the table's axis order. */
    keys: string[];
    /** The value domain of each key, in the table's own order. */
    domains: (string | number)[][];
    clockwise_90?: number[];
    clockwise_180?: number[];
    counterclockwise_90?: number[];
    left_right?: number[];
    front_back?: number[];
}

/** The generated table: how every Bedrock state reachable from Java rotates and mirrors. */
interface StateTransformTable {
    javaVersion: string;
    bedrockVersion: string;
    geyserMappingsCommit: string;
    paletteStateCount: number;
    ambiguous: { identifier: string; transform: TransformName; state: number }[];
    identifiers: Record<string, TransformEntry>;
}

// The table is generated JSON; the generator guarantees this shape and the
// JSON import's literal types are too wide to be useful.
const transformTable = table as unknown as StateTransformTable;

/** The pinned versions the transform table was generated from. */
export const STATE_TRANSFORM_VERSIONS = {
    javaVersion: transformTable.javaVersion,
    bedrockVersion: transformTable.bedrockVersion,
    geyserMappingsCommit: transformTable.geyserMappingsCommit
} as const;

/** How a template is placed: the mirror applies first, then the rotation, as Java does. */
export interface Placement {
    readonly rotation?: Rotation;
    readonly mirror?: Mirror;
}

/** A palette state the transform could not resolve, with the reason. */
export interface TransformMismatch {
    readonly state: BedrockBlockState;
    readonly transform: TransformName;
    readonly reason:
        /** No Java block reaches this identifier, so the table has no rule for it. */
        | 'no-rule'
        /**
         * Several Java states collapse onto this Bedrock state and do not
         * transform alike, so the Bedrock state cannot say which one it was.
         */
        | 'ambiguous';
}

/** The result of transforming a template, with everything the transform could not resolve. */
export interface TransformedTemplate {
    readonly template: BedrockStructureTemplate;
    /** Palette states placed unchanged because the table has no rule or no ambiguity-free answer. */
    readonly mismatches: readonly TransformMismatch[];
}

const strides = new Map<string, number[]>();
const stridesOf = (identifier: string, entry: TransformEntry): number[] => {
    let cached = strides.get(identifier);
    if (cached === undefined) {
        cached = entry.domains.map((_, position) =>
            entry.domains.slice(position + 1).reduce((product, domain) => product * domain.length, 1)
        );
        strides.set(identifier, cached);
    }
    return cached;
};

const ambiguousStates = new Set(
    transformTable.ambiguous.map((entry) => `${entry.identifier}|${entry.transform}|${entry.state}`)
);

/**
 * The value domain of each state key a Bedrock identifier declares, or
 * `undefined` for an identifier no Java block reaches. The domains come from
 * the same pinned palette the mapping package publishes.
 */
export const stateDomainsOf = (
    identifier: string
): Readonly<Record<string, readonly (string | number)[]>> | undefined => {
    const entry = transformTable.identifiers[identifier];
    if (entry === undefined) return undefined;
    return Object.fromEntries(entry.keys.map((key, axis) => [key, entry.domains[axis] ?? []]));
};

/** The transforms a placement applies, mirror first, in the order the table stores them. */
const transformsOf = (placement: Placement): TransformName[] => {
    const names: TransformName[] = [];
    if (placement.mirror !== undefined && placement.mirror !== 'none') names.push(placement.mirror);
    if (placement.rotation !== undefined && placement.rotation !== 'none') names.push(placement.rotation);
    return names;
};

const indexOf = (
    entry: TransformEntry,
    identifier: string,
    states: BedrockBlockState['states']
): number | undefined => {
    const stride = stridesOf(identifier, entry);
    let index = 0;
    for (const [axis, key] of entry.keys.entries()) {
        const position = (entry.domains[axis] ?? []).indexOf(states[key] ?? '');
        if (position < 0) return undefined;
        index += position * (stride[axis] ?? 1);
    }
    return index;
};

const stateAt = (entry: TransformEntry, identifier: string, index: number): Record<string, string | number> => {
    const stride = stridesOf(identifier, entry);
    const states: Record<string, string | number> = {};
    for (const [axis, key] of entry.keys.entries()) {
        const domain = entry.domains[axis] ?? [];
        const value = domain[Math.floor(index / (stride[axis] ?? 1)) % domain.length];
        if (value !== undefined) states[key] = value;
    }
    return states;
};

/** One transform step over a Bedrock state, reporting what it could not resolve. */
const applyOne = (
    state: BedrockBlockState,
    transform: TransformName,
    mismatches: TransformMismatch[]
): BedrockBlockState => {
    const entry = transformTable.identifiers[state.name];
    if (entry === undefined) {
        if (Object.keys(state.states).length > 0) mismatches.push({ state, transform, reason: 'no-rule' });
        return state;
    }

    const index = indexOf(entry, state.name, state.states);
    if (index === undefined) {
        mismatches.push({ state, transform, reason: 'no-rule' });
        return state;
    }
    if (ambiguousStates.has(`${state.name}|${transform}|${index}`)) {
        mismatches.push({ state, transform, reason: 'ambiguous' });
    }

    const target = entry[transform]?.[index];
    if (target === undefined || target === index) return state;
    return { name: state.name, states: stateAt(entry, state.name, target) };
};

/**
 * Transforms one Bedrock block state under a placement. Direction-valued
 * states follow Java Edition's own `rotate` and `mirror` rules, measured from
 * the pinned server jar and keyed by Bedrock state, so the two editions'
 * different axis names on stairs, logs and slabs never have to be lined up
 * by hand.
 *
 * A state the table has no rule for comes back unchanged; use
 * {@link transformTemplate} when the unresolved states matter.
 */
export const transformBedrockState = (state: BedrockBlockState, placement: Placement): BedrockBlockState => {
    const mismatches: TransformMismatch[] = [];
    return transformsOf(placement).reduce((current, name) => applyOne(current, name, mismatches), state);
};

/** Rotates one Bedrock block state about the vertical axis. */
export const rotateBedrockState = (state: BedrockBlockState, rotation: Rotation): BedrockBlockState =>
    transformBedrockState(state, { rotation });

/** Mirrors one Bedrock block state. */
export const mirrorBedrockState = (state: BedrockBlockState, mirror: Mirror): BedrockBlockState =>
    transformBedrockState(state, { mirror });

/** The extent a template has after a placement: a quarter turn swaps the x and z extents. */
export const transformedSize = (size: TemplatePosition, placement: Placement): TemplatePosition =>
    placement.rotation === 'clockwise_90' || placement.rotation === 'counterclockwise_90'
        ? [size[2], size[1], size[0]]
        : [size[0], size[1], size[2]];

/**
 * Moves a block position under a placement, keeping the result inside the
 * transformed template rather than around Java's world-space pivot.
 */
export const transformPosition = (
    size: TemplatePosition,
    [x, y, z]: TemplatePosition,
    placement: Placement
): TemplatePosition => {
    const mirroredX = placement.mirror === 'front_back' ? size[0] - 1 - x : x;
    const mirroredZ = placement.mirror === 'left_right' ? size[2] - 1 - z : z;
    switch (placement.rotation) {
        case 'clockwise_90':
            return [size[2] - 1 - mirroredZ, y, mirroredX];
        case 'clockwise_180':
            return [size[0] - 1 - mirroredX, y, size[2] - 1 - mirroredZ];
        case 'counterclockwise_90':
            return [mirroredZ, y, size[0] - 1 - mirroredX];
        default:
            return [mirroredX, y, mirroredZ];
    }
};

/**
 * Moves a fractional entity position under a placement. Entities sit between
 * blocks, so the reflection is about the template edge rather than the last
 * block's index.
 */
export const transformEntityPosition = (
    size: TemplatePosition,
    [x, y, z]: EntityPosition,
    placement: Placement
): EntityPosition => {
    const mirroredX = placement.mirror === 'front_back' ? size[0] - x : x;
    const mirroredZ = placement.mirror === 'left_right' ? size[2] - z : z;
    switch (placement.rotation) {
        case 'clockwise_90':
            return [size[2] - mirroredZ, y, mirroredX];
        case 'clockwise_180':
            return [size[0] - mirroredX, y, size[2] - mirroredZ];
        case 'counterclockwise_90':
            return [mirroredZ, y, size[0] - mirroredX];
        default:
            return [mirroredX, y, mirroredZ];
    }
};

/**
 * Places a template under a rotation and a mirror, moving both the block
 * positions and the direction-valued block states.
 *
 * The palette is transformed once per entry rather than once per block, and
 * every state the transform could not resolve comes back in
 * {@link TransformedTemplate.mismatches} instead of being changed silently.
 * Block entity and entity NBT is carried across untouched: the direction a
 * jigsaw block entity names in `final_state` is the caller's to transform.
 */
export const transformTemplate = (template: BedrockStructureTemplate, placement: Placement): TransformedTemplate => {
    const mismatches: TransformMismatch[] = [];
    const names = transformsOf(placement);
    const palette = template.palette.map((state) =>
        names.reduce((current, name) => applyOne(current, name, mismatches), state)
    );

    const size = transformedSize(template.size, placement);
    const blocks: BedrockTemplateBlock[] = template.blocks.map((block) => ({
        ...block,
        pos: transformPosition(template.size, block.pos, placement)
    }));
    const entities: TemplateEntity[] = template.entities.map((entity) => ({
        ...entity,
        pos: transformEntityPosition(template.size, entity.pos, placement),
        ...(entity.blockPos === undefined
            ? {}
            : { blockPos: transformPosition(template.size, entity.blockPos, placement) })
    }));

    return {
        template: { ...template, size, palette, blocks, entities },
        mismatches
    };
};

/**
 * Checks the generated transform table against itself: every permutation is
 * a bijection over its identifier's states, four quarter turns are the
 * identity, the two quarter turns are inverses, and each mirror is its own
 * inverse. Returns one message per failure, empty when the table is sound.
 *
 * The identifiers in {@link AMBIGUOUS_STATE_TRANSFORMS} are skipped. Their
 * permutations cannot be bijections, because several Java states that do not
 * transform alike collapse onto one Bedrock state, and that loss is reported
 * through the ambiguity list instead.
 */
export const verifyStateTransforms = (): string[] => {
    const problems: string[] = [];
    const skip = new Set(transformTable.ambiguous.map((entry) => entry.identifier));
    const compose = (first: number[], second: number[]): number[] => first.map((target) => second[target] ?? target);
    const identity = (size: number): number[] => Array.from({ length: size }, (_, index) => index);
    const isIdentity = (permutation: number[]): boolean => permutation.every((target, index) => target === index);

    for (const [identifier, entry] of Object.entries(transformTable.identifiers)) {
        if (skip.has(identifier)) continue;
        const size = entry.domains.reduce((product, domain) => product * domain.length, 1);
        const permutations = new Map<TransformName, number[]>();
        for (const name of TRANSFORM_NAMES) {
            const permutation = entry[name] ?? identity(size);
            if (permutation.length !== size) {
                problems.push(`${identifier} ${name}: ${permutation.length} entries for ${size} states`);
            }
            if (new Set(permutation).size !== permutation.length) {
                problems.push(`${identifier} ${name}: not a bijection`);
            }
            permutations.set(name, permutation);
        }

        const quarter = permutations.get('clockwise_90') ?? identity(size);
        const half = permutations.get('clockwise_180') ?? identity(size);
        const back = permutations.get('counterclockwise_90') ?? identity(size);
        if (!isIdentity(compose(compose(quarter, quarter), compose(quarter, quarter)))) {
            problems.push(`${identifier}: four quarter turns are not the identity`);
        }
        if (!isIdentity(compose(quarter, back))) {
            problems.push(`${identifier}: the two quarter turns are not inverses`);
        }
        if (!isIdentity(compose(half, half))) problems.push(`${identifier}: a half turn is not its own inverse`);
        for (const name of ['left_right', 'front_back'] as const) {
            const mirror = permutations.get(name) ?? identity(size);
            if (!isIdentity(compose(mirror, mirror))) problems.push(`${identifier} ${name}: not its own inverse`);
        }
    }
    return problems;
};

/**
 * The Bedrock states whose transform is ambiguous, because several Java
 * states that do not transform alike collapse onto them. The table keeps the
 * first of those answers; a template placing one of these states gets a
 * `ambiguous` mismatch.
 */
export const AMBIGUOUS_STATE_TRANSFORMS: readonly { identifier: string; transform: TransformName }[] = [
    ...new Map(
        transformTable.ambiguous.map((entry) => [
            `${entry.identifier}|${entry.transform}`,
            { identifier: entry.identifier, transform: entry.transform }
        ])
    ).values()
];
