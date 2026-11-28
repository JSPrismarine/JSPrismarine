/**
 * The `@minecraft/server` members of block volumes and boxes: `BlockBoundingBoxUtils`,
 * `BlockVolume`, `ListBlockVolume`, what they share through `BlockVolumeBase`, and
 * `BlockLocationIterator`.
 *
 * None of them reads the world. A volume carries its corners, or its list of locations, in its
 * state; an iterator carries the locations it has left and a link to its volume, so it can tell
 * when the volume changed under it. The orders and edge cases follow the `block-volumes` scenario
 * recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import type { ScriptApiError } from '../../errors';
import { plainError, SERVER, vectorArgument } from '../serverObjects';
import type { ScriptVector3 } from '../world';
import { BLOCK_ITEM_TAG } from './tags';

/** A box of whole blocks, both corners inside it. */
export interface BlockBox {
    readonly min: ScriptVector3;
    readonly max: ScriptVector3;
}

/**
 * What a volume object carries: a `BlockVolume`'s two corners, floored, in the order the script
 * gave them, or a `ListBlockVolume`'s locations in the order its iterator walks them.
 */
export type VolumeState =
    | { readonly kind: 'corners'; readonly from: ScriptVector3; readonly to: ScriptVector3 }
    | { readonly kind: 'list'; readonly locations: readonly ScriptVector3[] };

const AXES = ['x', 'y', 'z'] as const;

/** A whole-block location, as a volume floors its corners and the locations it is given. */
const blockOf = ({ x, y, z }: ScriptVector3): ScriptVector3 => ({
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z)
});

/** A whole-block location, as `BlockBoundingBoxUtils` truncates what it is given toward zero. */
const truncated = ({ x, y, z }: ScriptVector3): ScriptVector3 => ({
    x: Math.trunc(x),
    y: Math.trunc(y),
    z: Math.trunc(z)
});

const map = (a: ScriptVector3, b: ScriptVector3, each: (a: number, b: number) => number): ScriptVector3 => ({
    x: each(a.x, b.x),
    y: each(a.y, b.y),
    z: each(a.z, b.z)
});

const same = (a: ScriptVector3, b: ScriptVector3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** The box from two corners in any order. */
export const boxOf = (a: ScriptVector3, b: ScriptVector3): BlockBox => ({
    min: map(a, b, Math.min),
    max: map(a, b, Math.max)
});

/** Whether a box's corners are in order on every axis. */
const valid = ({ min, max }: BlockBox): boolean => AXES.every((axis) => min[axis] <= max[axis]);

/** How many blocks a box spans on each axis. */
const span = ({ min, max }: BlockBox): ScriptVector3 => map(max, min, (high, low) => high - low + 1);

/** Whether a location is inside a box, corners included. */
const inside = ({ min, max }: BlockBox, location: ScriptVector3): boolean =>
    AXES.every((axis) => location[axis] >= min[axis] && location[axis] <= max[axis]);

/** Whether two boxes share a block. */
const overlaps = (a: BlockBox, b: BlockBox): boolean =>
    AXES.every((axis) => a.min[axis] <= b.max[axis] && b.min[axis] <= a.max[axis]);

/** The box two boxes share, or undefined when they share no block. */
const intersection = (a: BlockBox, b: BlockBox): BlockBox | undefined =>
    overlaps(a, b) ? { min: map(a.min, b.min, Math.max), max: map(a.max, b.max, Math.min) } : undefined;

/** The locations of a box as its iterator walks them: y slowest, then z, then x. */
const locationsOf = ({ min, max }: BlockBox): ScriptVector3[] => {
    const found: ScriptVector3[] = [];
    for (let y = min.y; y <= max.y; y++)
        for (let z = min.z; z <= max.z; z++) for (let x = min.x; x <= max.x; x++) found.push({ x, y, z });
    return found;
};

/** The locations of a box as `getClosest` and `getFarthest` weigh them: x slowest, then y, then z. */
const candidatesOf = ({ min, max }: BlockBox): ScriptVector3[] => {
    const found: ScriptVector3[] = [];
    for (let x = min.x; x <= max.x; x++)
        for (let y = min.y; y <= max.y; y++) for (let z = min.z; z <= max.z; z++) found.push({ x, y, z });
    return found;
};

/**
 * The first `count` of `items` by `before`, as C++'s `std::partial_sort` leaves them: a heap of
 * the first `count`, each later item that sorts before the heap's top replacing it, then the heap
 * sorted. Items that tie keep the order the heap gives them, which is what BDS returns.
 */
export const partialSort = <Item>(
    items: readonly Item[],
    count: number,
    before: (a: Item, b: Item) => boolean
): Item[] => {
    const heap = items.slice(0, Math.min(count, items.length));
    const length = heap.length;
    const adjust = (array: Item[], start: number, size: number, value: Item): void => {
        let hole = start;
        let child = hole;
        while (child < Math.floor((size - 1) / 2)) {
            child = 2 * (child + 1);
            if (before(array[child] as Item, array[child - 1] as Item)) child--;
            array[hole] = array[child] as Item;
            hole = child;
        }
        if ((size & 1) === 0 && child === Math.floor((size - 2) / 2)) {
            child = 2 * (child + 1);
            array[hole] = array[child - 1] as Item;
            hole = child - 1;
        }
        let parent = Math.floor((hole - 1) / 2);
        while (hole > start && before(array[parent] as Item, value)) {
            array[hole] = array[parent] as Item;
            hole = parent;
            parent = Math.floor((hole - 1) / 2);
        }
        array[hole] = value;
    };
    if (length > 1)
        for (let parent = Math.floor((length - 2) / 2); parent >= 0; parent--)
            adjust(heap, parent, length, heap[parent] as Item);
    for (const item of items.slice(length)) {
        if (length > 0 && before(item, heap[0] as Item)) adjust(heap, 0, length, item);
    }
    for (let end = length - 1; end > 0; end--) {
        const value = heap[end] as Item;
        heap[end] = heap[0] as Item;
        adjust(heap, 0, end, value);
    }
    return heap;
};

/** Reads a plain object argument, which the engine copies as JSON. */
const plainArgument = (call: ScriptCall, index: number): unknown => {
    const json = call.stringify(call.args[index]);
    // The engine wrote the string with JSON.stringify.
    return json === undefined ? undefined : JSON.parse(json);
};

const vectorOf = (value: unknown, index: number, expected: string): ScriptVector3 => {
    const read = (key: string): number => {
        const part = isRecord(value) ? value[key] : undefined;
        if (typeof part !== 'number' || !Number.isFinite(part)) {
            throw new ScriptHostErrors.ArgumentConversionFailed({ index, expected });
        }
        return part;
    };
    return { x: read('x'), y: read('y'), z: read('z') };
};

/** A `BlockBoundingBox` argument, as plain data. */
const boxArgument = (call: ScriptCall, index: number): BlockBox => {
    const value = plainArgument(call, index);
    const part = (key: 'min' | 'max') =>
        truncated(vectorOf(isRecord(value) ? value[key] : undefined, index, 'BlockBoundingBox'));
    return { min: part('min'), max: part('max') };
};

/** A `Vector3[]` argument, as plain data. */
const vectorsArgument = (call: ScriptCall, index: number): ScriptVector3[] => {
    const value = plainArgument(call, index);
    if (!Array.isArray(value)) throw new ScriptHostErrors.ArgumentConversionFailed({ index, expected: 'Vector3[]' });
    return value.map((each) => blockOf(vectorOf(each, index, 'Vector3[]')));
};

/** Reads a volume object's state. The host wrote every state, so a bad one is a host bug. */
export const volumeOf = (state: string): VolumeState =>
    // The host wrote the string with JSON.stringify.
    volumeFrom(state === '' ? undefined : JSON.parse(state));

/** A volume's state, parsed. */
const volumeFrom = (parsed: unknown): VolumeState => {
    if (isRecord(parsed) && parsed.kind === 'corners') {
        return { kind: 'corners', from: vectorOf(parsed.from, 0, 'Vector3'), to: vectorOf(parsed.to, 0, 'Vector3') };
    }
    if (isRecord(parsed) && parsed.kind === 'list' && Array.isArray(parsed.locations)) {
        return { kind: 'list', locations: parsed.locations.map((each) => vectorOf(each, 0, 'Vector3')) };
    }
    throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'block volume' });
};

/** BDS's error for the bounds of a list volume with no locations. */
const emptyVolume = (bound: 'minimum' | 'maximum' | 'box'): ScriptApiError =>
    plainError(
        bound === 'box'
            ? 'Cannot get bounding box of empty block volume.'
            : `Cannot get ${bound} location of empty block volume.`
    );

/** The box around a volume. A list with no locations has none, and BDS's error names the bound asked for. */
const volumeBox = (volume: VolumeState, bound: 'minimum' | 'maximum' | 'box' = 'minimum'): BlockBox => {
    if (volume.kind === 'corners') return boxOf(volume.from, volume.to);
    const [first, ...rest] = volume.locations;
    if (first === undefined) throw emptyVolume(bound);
    return rest.reduce<BlockBox>(
        (box, location) => ({ min: map(box.min, location, Math.min), max: map(box.max, location, Math.max) }),
        { min: first, max: first }
    );
};

/** Every location of a volume, in the order its iterator walks them. */
export const volumeLocations = (volume: VolumeState): ScriptVector3[] =>
    volume.kind === 'corners' ? locationsOf(volumeBox(volume)) : [...volume.locations];

/** How many locations a volume holds. */
const volumeSize = (volume: VolumeState): number => {
    if (volume.kind === 'list') return volume.locations.length;
    const { min, max } = volumeBox(volume);
    return (max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1);
};

/**
 * The location at `index` of a volume's walk, in the order {@link volumeLocations} lists them:
 * x fastest, then z, then y for a box, and a list in its own order. Undefined past the end.
 */
const volumeLocationAt = (volume: VolumeState, index: number): ScriptVector3 | undefined => {
    if (volume.kind === 'list') return volume.locations[index];
    if (index >= volumeSize(volume)) return undefined;
    const { min, max } = volumeBox(volume);
    const spanX = max.x - min.x + 1;
    const spanZ = max.z - min.z + 1;
    return {
        x: min.x + (index % spanX),
        y: min.y + Math.floor(index / (spanX * spanZ)),
        z: min.z + (Math.floor(index / spanX) % spanZ)
    };
};

/**
 * What a `BlockLocationIterator` holds: the volume it was made from, as it was then, and how many
 * of its locations it has given. Each step reads one location from the volume rather than
 * carrying the locations left, which made a walk of n locations cost n² as the list was parsed
 * and written again on every step: a check of a 60,000-block box held a tick for half a minute.
 */
interface IteratorState {
    readonly volume: VolumeState;
    readonly at: number;
}

const volumeContains = (volume: VolumeState, location: ScriptVector3): boolean =>
    volume.kind === 'corners'
        ? inside(volumeBox(volume), location)
        : volume.locations.some((each) => same(each, location));

/** Whether a location lies on a face of a box. */
const onFace = ({ min, max }: BlockBox, location: ScriptVector3): boolean =>
    AXES.some((axis) => location[axis] === min[axis] || location[axis] === max[axis]);

const distanceSquared = (a: ScriptVector3, b: ScriptVector3): number =>
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** `BlockVolumeIntersection`'s values. */
const INTERSECTION = { Disjoint: 0, Contains: 1, Intersects: 2 } as const;

/**
 * Registers the volume and box members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime.
 */
export const implementVolumes = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const write = (call: ScriptCall, volume: VolumeState): void => call.setState(JSON.stringify(volume));
    const box = (call: ScriptCall): BlockBox => volumeBox(volumeOf(call.state));
    const json = (value: unknown): string => JSON.stringify(value);
    const change = (call: ScriptCall, edit: (volume: VolumeState) => VolumeState): void =>
        write(call, edit(volumeOf(call.state)));
    const sorted = (call: ScriptCall, farthest: boolean): string => {
        const [count] = call.args;
        const location = vectorArgument(call, 1);
        const volume = volumeOf(call.state);
        const locations = volume.kind === 'corners' ? candidatesOf(volumeBox(volume)) : volume.locations;
        const weighed = locations.map((each) => ({ each, distance: distanceSquared(each, location) }));
        const ordered = partialSort(
            weighed,
            typeof count === 'number' ? Math.max(0, Math.trunc(count)) : 0,
            farthest ? (a, b) => a.distance > b.distance : (a, b) => a.distance < b.distance
        );
        return json(ordered.map(({ each }) => each));
    };
    /** Makes a plain object in the engine from JSON, for a member whose result the binding does not parse. */
    const plainObject = (value: unknown): ScriptHandle => {
        const made = host.engine.evaluate(`(${JSON.stringify(value)})`, '<jsp iterator result>');
        if (!(made instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
        return host.engine.release(made);
    };
    /** An iterator's volume and position. */
    const iteratorOf = (state: string): IteratorState => {
        // The host wrote the string with JSON.stringify.
        const parsed: unknown = JSON.parse(state);
        if (!isRecord(parsed) || typeof parsed.at !== 'number')
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'block location iterator' });
        return { volume: volumeFrom(parsed.volume), at: parsed.at };
    };

    implementations
        .implement(SERVER, 'BlockBoundingBoxUtils', 'createValid', (call) =>
            json(boxOf(truncated(vectorArgument(call, 0)), truncated(vectorArgument(call, 1))))
        )
        .implement(SERVER, 'BlockBoundingBoxUtils', 'dilate', (call) => {
            const { min, max } = boxArgument(call, 0);
            const size = truncated(vectorArgument(call, 1));
            return json({ min: map(min, size, (a, b) => a - b), max: map(max, size, (a, b) => a + b) });
        })
        .implement(SERVER, 'BlockBoundingBoxUtils', 'equals', (call) => {
            const a = boxArgument(call, 0);
            const b = boxArgument(call, 1);
            return same(a.min, b.min) && same(a.max, b.max);
        })
        .implement(SERVER, 'BlockBoundingBoxUtils', 'expand', (call) => {
            const a = boxArgument(call, 0);
            const b = boxArgument(call, 1);
            return json({ min: map(a.min, b.min, Math.min), max: map(a.max, b.max, Math.max) });
        })
        .implement(SERVER, 'BlockBoundingBoxUtils', 'getCenter', (call) => {
            const { min, max } = boxArgument(call, 0);
            // Half the span, rounded toward zero, from the low corner.
            return json(map(min, max, (low, high) => low + Math.trunc((high - low + 1) / 2)));
        })
        .implement(SERVER, 'BlockBoundingBoxUtils', 'getIntersection', (call) => {
            const found = intersection(boxArgument(call, 0), boxArgument(call, 1));
            return found === undefined ? undefined : json(found);
        })
        .implement(SERVER, 'BlockBoundingBoxUtils', 'getSpan', (call) => json(span(boxArgument(call, 0))))
        .implement(SERVER, 'BlockBoundingBoxUtils', 'intersects', (call) =>
            overlaps(boxArgument(call, 0), boxArgument(call, 1))
        )
        .implement(SERVER, 'BlockBoundingBoxUtils', 'isInside', (call) =>
            inside(boxArgument(call, 0), truncated(vectorArgument(call, 1)))
        )
        .implement(SERVER, 'BlockBoundingBoxUtils', 'isValid', (call) => valid(boxArgument(call, 0)))
        .implement(SERVER, 'BlockBoundingBoxUtils', 'translate', (call) => {
            const { min, max } = boxArgument(call, 0);
            const delta = truncated(vectorArgument(call, 1));
            return json({ min: map(min, delta, (a, b) => a + b), max: map(max, delta, (a, b) => a + b) });
        })
        .implement(SERVER, 'BlockVolume', 'constructor', (call) =>
            JSON.stringify({
                kind: 'corners',
                from: blockOf(vectorArgument(call, 0)),
                to: blockOf(vectorArgument(call, 1))
            } satisfies VolumeState)
        )
        .implement(SERVER, 'BlockVolume', 'from', {
            get: (call) => {
                const volume = volumeOf(call.state);
                return json(volume.kind === 'corners' ? volume.from : volumeBox(volume).min);
            },
            set: (call) =>
                change(call, (volume) =>
                    volume.kind === 'corners' ? { ...volume, from: blockOf(vectorArgument(call, 0)) } : volume
                )
        })
        .implement(SERVER, 'BlockVolume', 'to', {
            get: (call) => {
                const volume = volumeOf(call.state);
                return json(volume.kind === 'corners' ? volume.to : volumeBox(volume).max);
            },
            set: (call) =>
                change(call, (volume) =>
                    volume.kind === 'corners' ? { ...volume, to: blockOf(vectorArgument(call, 0)) } : volume
                )
        })
        .implement(SERVER, 'BlockVolume', 'doesLocationTouchFaces', (call) => {
            const location = blockOf(vectorArgument(call, 0));
            const own = box(call);
            return inside(own, location) && onFace(own, location);
        })
        .implement(SERVER, 'BlockVolume', 'doesVolumeTouchFaces', (call) => {
            const own = box(call);
            const other = volumeBox(volumeOf(call.stateOf(call.args[0] ?? null)));
            // BDS's answer is lopsided, and this is the rule its seventeen recorded cases fit: the
            // other volume starts at this one's low corner, or its high side ends on or just below
            // this one's low face on an axis while it overlaps this one on the other two.
            if (same(own.min, other.min)) return true;
            return AXES.some(
                (axis) =>
                    (other.max[axis] === own.min[axis] || other.max[axis] === own.min[axis] - 1) &&
                    AXES.every(
                        (each) =>
                            each === axis || (other.min[each] <= own.max[each] && own.min[each] <= other.max[each])
                    )
            );
        })
        .implement(SERVER, 'BlockVolume', 'intersects', (call) => {
            const own = box(call);
            const other = volumeBox(volumeOf(call.stateOf(call.args[0] ?? null)));
            if (!overlaps(own, other)) return INTERSECTION.Disjoint;
            return inside(own, other.min) && inside(own, other.max) ? INTERSECTION.Contains : INTERSECTION.Intersects;
        })
        .implement(SERVER, 'ListBlockVolume', 'constructor', (call) =>
            JSON.stringify({ kind: 'list', locations: added([], vectorsArgument(call, 0)) } satisfies VolumeState)
        )
        .implement(SERVER, 'ListBlockVolume', 'add', (call) => {
            const more = vectorsArgument(call, 0);
            change(call, (volume) =>
                volume.kind === 'list' ? { ...volume, locations: added(volume.locations, more) } : volume
            );
            return undefined;
        })
        .implement(SERVER, 'ListBlockVolume', 'remove', (call) => {
            const removed = vectorsArgument(call, 0);
            change(call, (volume) =>
                volume.kind === 'list'
                    ? {
                          ...volume,
                          locations: volume.locations.filter((each) => !removed.some((gone) => same(gone, each)))
                      }
                    : volume
            );
            return undefined;
        })
        .implement(SERVER, 'BlockVolumeBase', 'getBoundingBox', (call) => json(volumeBox(volumeOf(call.state), 'box')))
        .implement(SERVER, 'BlockVolumeBase', 'getCapacity', (call) => {
            const volume = volumeOf(call.state);
            if (volume.kind === 'list') return volume.locations.length;
            const { x, y, z } = span(volumeBox(volume));
            return x * y * z;
        })
        .implement(SERVER, 'BlockVolumeBase', 'getMin', (call) => json(box(call).min))
        .implement(SERVER, 'BlockVolumeBase', 'getMax', (call) => json(volumeBox(volumeOf(call.state), 'maximum').max))
        .implement(SERVER, 'BlockVolumeBase', 'getSpan', (call) => {
            const volume = volumeOf(call.state);
            // An empty list spans nothing, where its bounds throw.
            if (volume.kind === 'list' && volume.locations.length === 0) return json({ x: 0, y: 0, z: 0 });
            return json(span(volumeBox(volume)));
        })
        .implement(SERVER, 'BlockVolumeBase', 'isInside', (call) =>
            volumeContains(volumeOf(call.state), blockOf(vectorArgument(call, 0)))
        )
        .implement(SERVER, 'BlockVolumeBase', 'translate', (call) => {
            const delta = blockOf(vectorArgument(call, 0));
            const add = (location: ScriptVector3) => map(location, delta, (a, b) => a + b);
            change(call, (volume) =>
                volume.kind === 'corners'
                    ? { ...volume, from: add(volume.from), to: add(volume.to) }
                    : // The list takes each moved location in again, which puts them in reverse order.
                      { ...volume, locations: added([], volume.locations.map(add)) }
            );
            return undefined;
        })
        .implement(SERVER, 'BlockVolumeBase', 'getClosest', (call) => sorted(call, false))
        .implement(SERVER, 'BlockVolumeBase', 'getFarthest', (call) => sorted(call, true))
        .implement(SERVER, 'BlockVolumeBase', 'getBlockLocationIterator', (call) => {
            const state: IteratorState = { volume: volumeOf(call.state), at: 0 };
            return host.engine.release(
                host.create('BlockLocationIterator', BLOCK_ITEM_TAG.locationIterator, JSON.stringify(state))
            );
        })
        // An iterator walks the locations its volume had when it was made, and a change to the
        // volume does not end it, as the scenario recorded after a translate.
        .implement(SERVER, 'BlockLocationIterator', 'isValid', (call) => {
            iteratorOf(call.state);
            return true;
        })
        .implement(SERVER, 'BlockLocationIterator', 'next', (call) => {
            const { volume, at } = iteratorOf(call.state);
            const value = volumeLocationAt(volume, at);
            if (value === undefined) return plainObject({ done: true, value: undefined });
            call.setState(JSON.stringify({ volume, at: at + 1 } satisfies IteratorState));
            return plainObject({ done: false, value });
        });
};

/** A list with the locations it does not hold yet put in front, each new one before the last, as BDS orders them. */
const added = (held: readonly ScriptVector3[], more: readonly ScriptVector3[]): ScriptVector3[] => {
    const result = [...held];
    for (const location of more) if (!result.some((each) => same(each, location))) result.unshift(location);
    return result;
};
