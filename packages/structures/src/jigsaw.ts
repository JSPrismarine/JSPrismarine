/**
 * Jigsaw assembly: the algorithm that grows a village, a bastion or a set of
 * trail ruins out of template pools.
 *
 * A piece's jigsaw blocks each name a target pool, a target jigsaw name and a
 * joint type. The assembler walks them breadth first, draws a candidate
 * element from the target pool by weight, tries the four rotations, and
 * accepts the first candidate whose own jigsaw faces back and whose bounding
 * box does not overlap a piece already placed. Everything random goes through
 * the injected {@link RandomSource}, so an assembly is reproducible.
 *
 * The shape is Java Edition 26.3's `JigsawPlacement`. Two parts of it are
 * deliberately left out, because they need a world this package does not
 * have: the terrain-matching projection's height adjustment and the
 * `use_expansion_hack` y search, and the voxel-accurate free-space shape,
 * which here is a list of piece bounding boxes.
 */
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';

import { numberAt, stringAt } from './nbtAccess';
import type { RandomSource } from './random';
import type { Rotation } from './tableShape';
import { transformPosition, transformedSize } from './transform';
import type { BedrockBlockState, BedrockStructureTemplate, TemplatePosition } from './types';
import { StructureFormatError } from './types';

/** A facing, in Java's own vocabulary, which both jigsaw fields use. */
export type Direction = 'down' | 'up' | 'north' | 'south' | 'east' | 'west';

/** Whether two jigsaws must share a top facing (`aligned`) or may not (`rollable`). */
export type JointType = 'rollable' | 'aligned';

/** How a pool element sits in the world. */
export type Projection = 'rigid' | 'terrain_matching';

/** The five `worldgen/template_pool` element types Java 26.3 registers. */
export const POOL_ELEMENT_TYPES = [
    'minecraft:empty_pool_element',
    'minecraft:feature_pool_element',
    'minecraft:legacy_single_pool_element',
    'minecraft:list_pool_element',
    'minecraft:single_pool_element'
] as const;

/** One of the five pool element types. */
export type PoolElementType = (typeof POOL_ELEMENT_TYPES)[number];

/** One element of a template pool. */
export interface PoolElement {
    readonly type: PoolElementType;
    /** The structure template identifier, for the two single element types. */
    readonly location?: string;
    /** The processor list identifier the element is placed through. */
    readonly processors?: string;
    readonly projection: Projection;
    /** The placed feature identifier, for a feature element. */
    readonly feature?: string;
    /** The members of a list element, all placed at the same position. */
    readonly elements?: readonly PoolElement[];
}

/** A `worldgen/template_pool`: weighted elements and the pool to fall back to. */
export interface TemplatePool {
    readonly elements: readonly { readonly element: PoolElement; readonly weight: number }[];
    readonly fallback: string;
}

/** One jigsaw block inside a template, with the connection it declares. */
export interface JigsawBlockInfo {
    /** The block's position inside the template. */
    readonly pos: TemplatePosition;
    /** The direction the connection points, which is where the next piece attaches. */
    readonly front: Direction;
    /** The jigsaw's own up direction, which an `aligned` joint must match. */
    readonly top: Direction;
    /** This jigsaw's name, which a parent's `target` matches against. */
    readonly name: string;
    /** The jigsaw name this connection looks for in the next piece. */
    readonly target: string;
    /** The template pool the next piece is drawn from. */
    readonly pool: string;
    readonly joint: JointType;
    /** The block state left where the jigsaw block was. */
    readonly finalState: string;
    readonly selectionPriority: number;
    readonly placementPriority: number;
}

/** An inclusive box in world space. */
export interface BoundingBox {
    readonly minX: number;
    readonly minY: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly maxZ: number;
}

/** One piece the assembler placed. */
export interface PlacedPiece {
    /** The template identifier, or the feature identifier for a feature element. */
    readonly location: string;
    readonly element: PoolElement;
    /** The world position of the piece's origin corner. */
    readonly position: TemplatePosition;
    readonly rotation: Rotation;
    readonly boundingBox: BoundingBox;
    /** How many jigsaw connections away from the start piece this piece sits. */
    readonly depth: number;
}

/** The result of an assembly, with the count of candidates the boxes rejected. */
export interface JigsawAssembly {
    /** The placed pieces, the start piece first, then in the order they were placed. */
    readonly pieces: readonly PlacedPiece[];
    /** How many candidate placements were rejected because their box overlapped a placed piece. */
    readonly rejectedForCollision: number;
    /** Jigsaw connections that found no pool, no candidate or no room. */
    readonly unresolvedConnections: number;
}

/** What an assembly draws on, all injected so a run is reproducible. */
export interface JigsawSources {
    /** Resolves a template pool identifier. */
    readonly pool: (identifier: string) => TemplatePool | undefined;
    /** Resolves a structure template identifier to a Bedrock-shaped template. */
    readonly template: (location: string) => BedrockStructureTemplate | undefined;
    readonly random: RandomSource;
    /** Pool identifiers this run replaces with another, from the structure's `pool_aliases`. */
    readonly poolAliases?: ReadonlyMap<string, string>;
}

/** The structure fields that drive an assembly. */
export interface JigsawConfig {
    readonly startPool: string;
    /** The jigsaw name in the start piece that lands on the start position. */
    readonly startJigsawName?: string;
    /** How many connections deep the assembly may go. */
    readonly maxDepth: number;
    /** The world position the start piece is placed at. */
    readonly startPosition: TemplatePosition;
    /** How far from the start position, in blocks, a piece may sit. */
    readonly maxDistanceFromCenter?: number;
}

const HORIZONTAL: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** The rotations in Java's `Rotation.values()` order, which the shuffles depend on. */
const ROTATIONS: readonly Rotation[] = ['none', 'clockwise_90', 'clockwise_180', 'counterclockwise_90'];

const QUARTER_TURNS: Readonly<Record<Rotation, number>> = {
    none: 0,
    clockwise_90: 1,
    clockwise_180: 2,
    counterclockwise_90: 3
};

/** Turns a facing about the vertical axis; up and down do not move. */
export const rotateDirection = (direction: Direction, rotation: Rotation): Direction => {
    const index = HORIZONTAL.indexOf(direction);
    if (index < 0) return direction;
    return HORIZONTAL[(index + QUARTER_TURNS[rotation]) % 4] ?? direction;
};

/** The facing opposite another. */
export const oppositeDirection = (direction: Direction): Direction =>
    direction === 'up'
        ? 'down'
        : direction === 'down'
          ? 'up'
          : (HORIZONTAL[(HORIZONTAL.indexOf(direction) + 2) % 4] ?? direction);

const DIRECTION_STEP: Readonly<Record<Direction, TemplatePosition>> = {
    down: [0, -1, 0],
    up: [0, 1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    west: [-1, 0, 0],
    east: [1, 0, 0]
};

const isDirection = (value: string): value is Direction => value in DIRECTION_STEP;

/**
 * Splits a Bedrock `orientation` value, which Java calls `FrontAndTop`, into
 * its two facings: `down_east` is front down and top east, `west_up` is front
 * west and top up.
 */
export const parseOrientation = (value: string): { front: Direction; top: Direction } | undefined => {
    const [front, top] = value.split('_');
    if (front === undefined || top === undefined || !isDirection(front) || !isDirection(top)) return undefined;
    return { front, top };
};

/**
 * The twelve `FrontAndTop` values, which Java spells as a block state and
 * Bedrock spells as a `facing_direction` and `rotation` pair. The two
 * spellings are joined through the mapping rather than written down, so the
 * Bedrock encoding stays whatever the pinned palette says it is.
 */
const JAVA_ORIENTATIONS = [
    'down_east',
    'down_north',
    'down_south',
    'down_west',
    'up_east',
    'up_north',
    'up_south',
    'up_west',
    'west_up',
    'east_up',
    'north_up',
    'south_up'
] as const;

const stateKey = (state: BedrockBlockState): string =>
    Object.keys(state.states)
        .sort()
        .map((key) => `${key}=${state.states[key]}`)
        .join(',');

const orientationByState = new Map<string, { front: Direction; top: Direction }>();
const stateByOrientation = new Map<string, BedrockBlockState>();
for (const name of JAVA_ORIENTATIONS) {
    const facing = parseOrientation(name);
    const result = javaBlockStateToBedrock('minecraft:jigsaw', { orientation: name });
    if (facing === undefined || result.kind === 'unknown') continue;
    orientationByState.set(stateKey(result.bedrock), facing);
    stateByOrientation.set(`${facing.front}|${facing.top}`, result.bedrock);
}

/** The front and top facings a Bedrock jigsaw block state encodes. */
export const jigsawOrientationOf = (state: BedrockBlockState): { front: Direction; top: Direction } | undefined =>
    state.name === 'minecraft:jigsaw' ? orientationByState.get(stateKey(state)) : undefined;

/** The Bedrock jigsaw block state for a front and top facing pair. */
export const jigsawStateFor = (front: Direction, top: Direction): BedrockBlockState | undefined =>
    stateByOrientation.get(`${front}|${top}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePoolElement = (definition: unknown): PoolElement => {
    if (!isRecord(definition)) throw new StructureFormatError('pool element: expected an object');
    const type = definition.element_type;
    if (typeof type !== 'string' || !POOL_ELEMENT_TYPES.includes(type as PoolElementType)) {
        throw new StructureFormatError(`pool element: unknown element_type ${String(type)}`);
    }

    const nested = Array.isArray(definition.elements) ? definition.elements.map(parsePoolElement) : undefined;
    return {
        type: type as PoolElementType,
        ...(typeof definition.location === 'string' ? { location: definition.location } : {}),
        ...(typeof definition.processors === 'string' ? { processors: definition.processors } : {}),
        projection: definition.projection === 'terrain_matching' ? 'terrain_matching' : 'rigid',
        ...(typeof definition.feature === 'string' ? { feature: definition.feature } : {}),
        ...(nested === undefined ? {} : { elements: nested })
    };
};

/**
 * Reads a `worldgen/template_pool` file.
 *
 * @throws {StructureFormatError} When the file has no element list or names an unknown element type.
 */
export const parseTemplatePool = (definition: unknown): TemplatePool => {
    if (!isRecord(definition) || !Array.isArray(definition.elements)) {
        throw new StructureFormatError('template pool: no elements');
    }
    return {
        elements: definition.elements.map((entry) => {
            if (!isRecord(entry)) throw new StructureFormatError('template pool: an entry is not an object');
            return {
                element: parsePoolElement(entry.element),
                weight: typeof entry.weight === 'number' ? entry.weight : 1
            };
        }),
        fallback: typeof definition.fallback === 'string' ? definition.fallback : 'minecraft:empty'
    };
};

/**
 * The jigsaw blocks a Bedrock-shaped template holds, read from the palette
 * entries named `minecraft:jigsaw` and their block entity NBT.
 *
 * Both spellings of the pool field are accepted: Java writes `pool` and
 * Bedrock's own `.mcstructure` jigsaw block entities write `target_pool`.
 */
export const jigsawBlocksOf = (template: BedrockStructureTemplate): JigsawBlockInfo[] => {
    const blocks: JigsawBlockInfo[] = [];
    for (const block of template.blocks) {
        const state = template.palette[block.state];
        if (state?.name !== 'minecraft:jigsaw' || block.nbt === undefined) continue;

        const facing = jigsawOrientationOf(state);
        const front = facing?.front ?? 'up';
        const top = facing?.top ?? 'north';
        const joint = stringAt(block.nbt, 'joint');

        blocks.push({
            pos: block.pos,
            front,
            top,
            name: stringAt(block.nbt, 'name') ?? 'minecraft:empty',
            target: stringAt(block.nbt, 'target') ?? 'minecraft:empty',
            pool: stringAt(block.nbt, 'pool') ?? stringAt(block.nbt, 'target_pool') ?? 'minecraft:empty',
            joint:
                joint === 'aligned' || joint === 'rollable'
                    ? joint
                    : front === 'up' || front === 'down'
                      ? 'rollable'
                      : 'aligned',
            finalState: stringAt(block.nbt, 'final_state') ?? 'minecraft:air',
            selectionPriority: numberAt(block.nbt, 'selection_priority') ?? 0,
            placementPriority: numberAt(block.nbt, 'placement_priority') ?? 0
        });
    }
    return blocks;
};

/**
 * Whether a child jigsaw can attach to a parent one: the two must face each
 * other, an `aligned` joint must also share a top facing, and the parent's
 * `target` must be the child's `name`.
 */
export const canAttach = (parent: JigsawBlockInfo, child: JigsawBlockInfo): boolean =>
    parent.front === oppositeDirection(child.front) &&
    (parent.joint === 'rollable' || parent.top === child.top) &&
    parent.target === child.name;

/** Moves a jigsaw block with its template under a rotation. */
const rotateJigsaw = (
    jigsaw: JigsawBlockInfo,
    size: TemplatePosition,
    rotation: Rotation,
    origin: TemplatePosition
): JigsawBlockInfo => {
    const local = transformPosition(size, jigsaw.pos, { rotation });
    return {
        ...jigsaw,
        pos: [local[0] + origin[0], local[1] + origin[1], local[2] + origin[2]],
        front: rotateDirection(jigsaw.front, rotation),
        top: rotateDirection(jigsaw.top, rotation)
    };
};

/** Java's `Util.shuffle`: a Fisher-Yates pass drawing `nextInt(i)` downward. */
const shuffled = <T>(values: readonly T[], random: RandomSource): T[] => {
    const result = [...values];
    for (let index = result.length; index > 1; index--) {
        const swap = random.nextInt(index);
        const last = result[index - 1];
        const chosen = result[swap];
        if (last === undefined || chosen === undefined) continue;
        result[index - 1] = chosen;
        result[swap] = last;
    }
    return result;
};

/** The pool's elements with each repeated by its weight, which is what Java draws from. */
const expandByWeight = (pool: TemplatePool): PoolElement[] =>
    pool.elements.flatMap((entry) => Array.from({ length: Math.max(0, entry.weight) }, () => entry.element));

const boxOf = (position: TemplatePosition, size: TemplatePosition): BoundingBox => ({
    minX: position[0],
    minY: position[1],
    minZ: position[2],
    maxX: position[0] + size[0] - 1,
    maxY: position[1] + size[1] - 1,
    maxZ: position[2] + size[2] - 1
});

/** Whether two inclusive boxes share any block. Boxes that only touch do not. */
export const boxesOverlap = (left: BoundingBox, right: BoundingBox): boolean =>
    left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY &&
    left.minZ <= right.maxZ &&
    left.maxZ >= right.minZ;

interface Candidate {
    readonly element: PoolElement;
    readonly location: string;
    readonly template: BedrockStructureTemplate;
}

/** The template a single pool element names, with its identifier. */
const candidateOf = (element: PoolElement, sources: JigsawSources): Candidate | undefined => {
    if (element.location === undefined) return undefined;
    const template = sources.template(element.location);
    return template === undefined ? undefined : { element, location: element.location, template };
};

interface QueuedPiece {
    readonly piece: PlacedPiece;
    readonly template: BedrockStructureTemplate;
    readonly depth: number;
}

/**
 * Grows a structure from a start pool.
 *
 * The walk is breadth first from the start piece, the same order Java's
 * `JigsawPlacement` uses, and every draw comes from
 * {@link JigsawSources.random}, so the same seed and the same pools produce
 * the same layout.
 *
 * @returns The placed pieces and a count of what the bounding boxes and the
 * pools rejected, which is how a caller sees a pool that cannot close.
 */
export const assembleJigsaw = (config: JigsawConfig, sources: JigsawSources): JigsawAssembly => {
    const resolvePool = (identifier: string): TemplatePool | undefined =>
        sources.pool(sources.poolAliases?.get(identifier) ?? identifier);

    const startPool = resolvePool(config.startPool);
    if (startPool === undefined) {
        return { pieces: [], rejectedForCollision: 0, unresolvedConnections: 1 };
    }

    const startElements = expandByWeight(startPool);
    const startElement = startElements[sources.random.nextInt(Math.max(1, startElements.length))];
    const start = startElement === undefined ? undefined : candidateOf(startElement, sources);
    if (start === undefined) {
        return { pieces: [], rejectedForCollision: 0, unresolvedConnections: 1 };
    }

    const startRotation = ROTATIONS[sources.random.nextInt(4)] ?? 'none';
    const startSize = transformedSize(start.template.size, { rotation: startRotation });

    let startPosition = config.startPosition;
    if (config.startJigsawName !== undefined) {
        const anchor = jigsawBlocksOf(start.template)
            .map((jigsaw) => rotateJigsaw(jigsaw, start.template.size, startRotation, [0, 0, 0]))
            .find((jigsaw) => jigsaw.name === config.startJigsawName);
        if (anchor !== undefined) {
            startPosition = [
                config.startPosition[0] - anchor.pos[0],
                config.startPosition[1] - anchor.pos[1],
                config.startPosition[2] - anchor.pos[2]
            ];
        }
    }

    const startPiece: PlacedPiece = {
        location: start.location,
        element: start.element,
        position: startPosition,
        rotation: startRotation,
        boundingBox: boxOf(startPosition, startSize),
        depth: 0
    };

    const pieces: PlacedPiece[] = [startPiece];
    const queue: QueuedPiece[] = [{ piece: startPiece, template: start.template, depth: 0 }];
    let rejectedForCollision = 0;
    let unresolvedConnections = 0;

    const withinRange = (box: BoundingBox): boolean => {
        if (config.maxDistanceFromCenter === undefined) return true;
        const limit = config.maxDistanceFromCenter;
        return (
            Math.abs(box.minX - config.startPosition[0]) <= limit &&
            Math.abs(box.maxX - config.startPosition[0]) <= limit &&
            Math.abs(box.minZ - config.startPosition[2]) <= limit &&
            Math.abs(box.maxZ - config.startPosition[2]) <= limit
        );
    };

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;

        const parentJigsaws = shuffled(
            jigsawBlocksOf(current.template).map((jigsaw) =>
                rotateJigsaw(jigsaw, current.template.size, current.piece.rotation, current.piece.position)
            ),
            sources.random
        );

        for (const parent of parentJigsaws) {
            const targetPool = resolvePool(parent.pool);
            if (targetPool === undefined) {
                unresolvedConnections++;
                continue;
            }
            const fallbackPool = resolvePool(targetPool.fallback);

            const candidates = [
                ...(current.depth < config.maxDepth ? shuffled(expandByWeight(targetPool), sources.random) : []),
                ...(fallbackPool === undefined ? [] : shuffled(expandByWeight(fallbackPool), sources.random))
            ];

            const step = DIRECTION_STEP[parent.front];
            const attachAt: TemplatePosition = [
                parent.pos[0] + step[0],
                parent.pos[1] + step[1],
                parent.pos[2] + step[2]
            ];

            let placed = false;
            for (const element of candidates) {
                if (placed) break;
                if (element.type === 'minecraft:empty_pool_element') break;

                const candidate = candidateOf(element, sources);
                if (candidate === undefined) continue;

                for (const rotation of shuffled(ROTATIONS, sources.random)) {
                    if (placed) break;
                    const size = transformedSize(candidate.template.size, { rotation });
                    const childJigsaws = shuffled(
                        jigsawBlocksOf(candidate.template).map((jigsaw) =>
                            rotateJigsaw(jigsaw, candidate.template.size, rotation, [0, 0, 0])
                        ),
                        sources.random
                    );

                    for (const child of childJigsaws) {
                        if (!canAttach(parent, child)) continue;

                        const position: TemplatePosition = [
                            attachAt[0] - child.pos[0],
                            attachAt[1] - child.pos[1],
                            attachAt[2] - child.pos[2]
                        ];
                        const box = boxOf(position, size);
                        if (!withinRange(box)) continue;
                        if (pieces.some((other) => boxesOverlap(other.boundingBox, box))) {
                            rejectedForCollision++;
                            continue;
                        }

                        const piece: PlacedPiece = {
                            location: candidate.location,
                            element,
                            position,
                            rotation,
                            boundingBox: box,
                            depth: current.depth + 1
                        };
                        pieces.push(piece);
                        queue.push({ piece, template: candidate.template, depth: current.depth + 1 });
                        placed = true;
                        break;
                    }
                }
            }

            if (!placed) unresolvedConnections++;
        }
    }

    return { pieces, rejectedForCollision, unresolvedConnections };
};

/**
 * Reads the `pool_aliases` list a jigsaw structure may carry, as a map from
 * the alias pool to the pool it stands for in this run.
 */
export const parsePoolAliases = (definition: unknown): Map<string, string> => {
    const aliases = new Map<string, string>();
    if (!Array.isArray(definition)) return aliases;
    for (const entry of definition) {
        if (!isRecord(entry)) continue;
        const alias = entry.alias;
        const target = entry.target;
        if (typeof alias === 'string' && typeof target === 'string') aliases.set(alias, target);
    }
    return aliases;
};
