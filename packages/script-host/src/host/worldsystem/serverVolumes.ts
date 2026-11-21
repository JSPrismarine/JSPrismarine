/**
 * A dimension's members over block volumes and regions: `fillBlocks`, `containsBlock`,
 * `getBlocks`, `containsBiomes` and `cloneBlocks`.
 *
 * A volume is read through its own `getBlockLocationIterator`, so any `BlockVolumeBase` works the
 * same, and a member that returns a volume makes a `ListBlockVolume` with its own constructor.
 * The `dimension-volumes` scenario recorded what BDS does: a fill returns the blocks it changed,
 * a volume reaching an unloaded chunk throws `UnloadedChunksError` with the count, and a clone
 * refuses regions that overlap unless forced and copies only the blocks a filter names.
 */
import { closestBlocks } from './closestBlocks';
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import {
    blockPosition,
    outsideWorld,
    permutationOf,
    plainError,
    SERVER,
    vectorArgument,
    withNamespace
} from '../serverObjects';
import type { ScriptBlockPermutation, ScriptVector3 } from '../world';
import { worldSystemOf } from './serverWorld';

/** Lists a volume's locations as JSON, inside the engine, through the volume's own iterator. */
const LOCATIONS_SOURCE =
    '(volume) => { const found = []; for (const at of volume.getBlockLocationIterator()) found.push({ x: at.x, y: at.y, z: at.z }); return JSON.stringify(found); }';

/** A `BlockFilter` as plain data. */
interface BlockFilter {
    readonly includeTypes?: readonly string[];
    readonly excludeTypes?: readonly string[];
    readonly includeTags?: readonly string[];
    readonly excludeTags?: readonly string[];
    readonly includePermutations?: readonly ScriptBlockPermutation[];
    readonly excludePermutations?: readonly ScriptBlockPermutation[];
}

/** Whether a permutation holds every state another names, as a filter's permutations match. */
const holds = (block: ScriptBlockPermutation, wanted: ScriptBlockPermutation): boolean =>
    block.typeId === wanted.typeId &&
    Object.entries(wanted.states).every(([name, value]) => block.states[name] === value);

/** Whether a block passes a filter. */
const passes = (block: ScriptBlockPermutation, tags: readonly string[], filter: BlockFilter | undefined): boolean => {
    if (filter === undefined) return true;
    const included =
        (filter.includeTypes === undefined &&
            filter.includeTags === undefined &&
            filter.includePermutations === undefined) ||
        filter.includeTypes?.some((type) => withNamespace(type) === block.typeId) === true ||
        filter.includeTags?.some((tag) => tags.includes(tag)) === true ||
        filter.includePermutations?.some((wanted) => holds(block, wanted)) === true;
    const excluded =
        filter.excludeTypes?.some((type) => withNamespace(type) === block.typeId) === true ||
        filter.excludeTags?.some((tag) => tags.includes(tag)) === true ||
        filter.excludePermutations?.some((wanted) => holds(block, wanted)) === true;
    return included && !excluded;
};

/** BDS's error for a volume that reaches chunks that are not loaded. */
const unloadedChunks = (unloaded: number, total: number): ScriptApiError =>
    new ScriptApiError(
        SERVER,
        'UnloadedChunksError',
        `Block Volume contains (${unloaded}) unloaded chunk(s) out of (${total}).`
    );

/**
 * Registers the volume members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementVolumes = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const system = () => worldSystemOf(host);
    /** A volume argument's locations, read through its iterator. */
    const locationsOf = (call: ScriptCall, index: number): ScriptVector3[] => {
        const read = call.engine.evaluate(LOCATIONS_SOURCE, '<jsp volume>');
        if (!(read instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The volume walk' });
        try {
            const json = call.engine.call(read, undefined, call.args[index] ?? null);
            // The walk wrote the string with JSON.stringify.
            const parsed: unknown = typeof json === 'string' ? JSON.parse(json) : [];
            return Array.isArray(parsed)
                ? parsed
                      .filter(isRecord)
                      .map((at) => blockPosition({ x: Number(at.x), y: Number(at.y), z: Number(at.z) }))
                : [];
        } finally {
            call.engine.free(read);
        }
    };
    /** Throws BDS's error when any chunk the locations reach is not loaded. */
    const requireLoaded = (dimension: string, locations: readonly ScriptVector3[]): void => {
        const chunks = new Map<string, ScriptVector3>();
        for (const at of locations) chunks.set(`${at.x >> 4} ${at.z >> 4}`, at);
        const unloaded = [...chunks.values()].filter((at) => world.block(dimension, at) === undefined).length;
        if (unloaded > 0) throw unloadedChunks(unloaded, chunks.size);
    };
    /** A `BlockFilter` argument, read as plain data with its permutations resolved. */
    const filterOf = (call: ScriptCall, value: ScriptValue | undefined): BlockFilter | undefined => {
        if (!(value instanceof ScriptHandle)) return undefined;
        const list = (key: string): string[] | undefined => {
            const found = call.engine.get(value, key);
            const json = found === undefined ? undefined : call.stringify(found);
            if (found instanceof ScriptHandle) call.engine.free(found);
            // The engine wrote the string with JSON.stringify.
            const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
            return Array.isArray(parsed) ? parsed.map(String) : undefined;
        };
        const permutations = (key: string): ScriptBlockPermutation[] | undefined => {
            const found = call.engine.get(value, key);
            if (!(found instanceof ScriptHandle)) return undefined;
            const length = call.engine.get(found, 'length');
            const read: ScriptBlockPermutation[] = [];
            for (let index = 0; typeof length === 'number' && index < length; index++) {
                const each = call.engine.get(found, String(index));
                const state = call.stateOf(each ?? null);
                if (each instanceof ScriptHandle) call.engine.free(each);
                if (state !== '') read.push(permutationOf(state));
            }
            call.engine.free(found);
            return read;
        };
        const includeTypes = list('includeTypes');
        const excludeTypes = list('excludeTypes');
        const includeTags = list('includeTags');
        const excludeTags = list('excludeTags');
        const includePermutations = permutations('includePermutations');
        const excludePermutations = permutations('excludePermutations');
        return {
            ...(includeTypes === undefined ? {} : { includeTypes }),
            ...(excludeTypes === undefined ? {} : { excludeTypes }),
            ...(includeTags === undefined ? {} : { includeTags }),
            ...(excludeTags === undefined ? {} : { excludeTags }),
            ...(includePermutations === undefined ? {} : { includePermutations }),
            ...(excludePermutations === undefined ? {} : { excludePermutations })
        };
    };
    const matches = (dimension: string, at: ScriptVector3, filter: BlockFilter | undefined): boolean => {
        const block = world.block(dimension, at);
        return block !== undefined && passes(block, system().blockTags(block.typeId), filter);
    };
    /** A new `ListBlockVolume` of locations, made with the class's own constructor. */
    const listVolume = (call: ScriptCall, locations: readonly ScriptVector3[]): ScriptValue => {
        const constructor = host.serverExport?.('ListBlockVolume');
        if (!(constructor instanceof ScriptHandle))
            throw new ScriptHostErrors.NotAFunction({ what: 'ListBlockVolume' });
        const make = call.engine.evaluate('(List, json) => new List(JSON.parse(json))', '<jsp ListBlockVolume>');
        if (!(make instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The volume maker' });
        try {
            const made = call.engine.call(make, undefined, constructor, JSON.stringify(locations));
            return made instanceof ScriptHandle ? call.engine.release(made) : made;
        } finally {
            call.engine.free(make);
            call.engine.free(constructor);
        }
    };
    /** The permutation a `BlockPermutation | BlockType | string` argument names. */
    const blockOf = (call: ScriptCall, value: ScriptValue | undefined): ScriptBlockPermutation => {
        const state = call.stateOf(value ?? null);
        if (state.startsWith('{')) return permutationOf(state);
        const typeId = state === '' ? withNamespace(String(value)) : withNamespace(state);
        const resolved = world.resolveBlock(typeId, {});
        if (resolved === undefined) {
            throw plainError(`Dimension.fillBlocks: Could not resolve passed in block [${String(value)}].`);
        }
        return resolved;
    };

    implementations
        .implement(SERVER, 'Dimension', 'fillBlocks', (call) => {
            const block = blockOf(call, call.args[1]);
            const locations = locationsOf(call, 0);
            const options = call.args[2];
            const ignoreUnloaded =
                options instanceof ScriptHandle && call.engine.get(options, 'ignoreChunkBoundErrors') === true;
            if (!ignoreUnloaded) requireLoaded(call.state, locations);
            const filterHandle = options instanceof ScriptHandle ? call.engine.get(options, 'blockFilter') : undefined;
            const filter = filterOf(call, filterHandle);
            if (filterHandle instanceof ScriptHandle) call.engine.free(filterHandle);
            const changed = locations.filter((at) => {
                if (!matches(call.state, at, filter)) return false;
                world.setBlock(call.state, at, block);
                return true;
            });
            return listVolume(call, changed);
        })
        .implement(SERVER, 'Dimension', 'containsBlock', (call) => {
            const locations = locationsOf(call, 0);
            if (call.args[2] !== true) requireLoaded(call.state, locations);
            const filter = filterOf(call, call.args[1]);
            return locations.some((at) => matches(call.state, at, filter));
        })
        .implement(SERVER, 'Dimension', 'getBlocks', (call) => {
            const locations = locationsOf(call, 0);
            if (call.args[2] !== true) requireLoaded(call.state, locations);
            const options = call.args[1];
            const filter = filterOf(call, options);
            let found = locations.filter((at) => matches(call.state, at, filter));
            if (options instanceof ScriptHandle) {
                const center = call.engine.get(options, 'location');
                const json = center === undefined ? undefined : call.stringify(center);
                if (center instanceof ScriptHandle) call.engine.free(center);
                // The engine wrote the string with JSON.stringify.
                const at: unknown = json === undefined ? undefined : JSON.parse(json);
                const closest = call.engine.get(options, 'closest');
                const farthest = call.engine.get(options, 'farthest');
                if (isRecord(at) && typeof closest === 'number') {
                    found = closestBlocks(found, { x: Number(at.x), y: Number(at.y), z: Number(at.z) }, closest);
                } else {
                    if (isRecord(at)) {
                        const distance = (each: ScriptVector3) =>
                            Math.hypot(each.x - Number(at.x), each.y - Number(at.y), each.z - Number(at.z));
                        found = [...found].sort((one, two) => distance(one) - distance(two));
                    }
                    if (typeof closest === 'number') found = found.slice(0, closest);
                    else if (typeof farthest === 'number') found = found.slice(-farthest).reverse();
                }
            }
            return listVolume(call, found);
        })
        .implement(SERVER, 'Dimension', 'containsBiomes', (call) => {
            const locations = locationsOf(call, 0);
            requireLoaded(call.state, locations);
            const json = call.stringify(call.args[1] ?? null);
            // The engine wrote the string with JSON.stringify.
            const filter: unknown = json === undefined ? {} : JSON.parse(json);
            const list = (key: string): string[] | undefined => {
                const value = isRecord(filter) ? filter[key] : undefined;
                return Array.isArray(value) ? value.map(String) : undefined;
            };
            const biomes = system().biomes();
            const passesBiome = (id: string | undefined): boolean => {
                if (id === undefined) return false;
                const tags = biomes.find((biome) => biome.id === id)?.tags ?? [];
                const includeBiomes = list('includeBiomes');
                const includeTags = list('includeTags');
                const included =
                    (includeBiomes === undefined && includeTags === undefined) ||
                    includeBiomes?.some((biome) => withNamespace(biome) === id) === true ||
                    includeTags?.some((tag) => tags.includes(tag)) === true;
                const excluded =
                    list('excludeBiomes')?.some((biome) => withNamespace(biome) === id) === true ||
                    list('excludeTags')?.some((tag) => tags.includes(tag)) === true;
                return included && !excluded;
            };
            const found = locations.map((at) => passesBiome(system().biome(call.state, at)));
            // A superset holds only the biomes the filter allows; otherwise one is enough.
            return call.args[2] === true ? found.every(Boolean) : found.some(Boolean);
        })
        .implement(SERVER, 'Dimension', 'cloneBlocks', (call) => {
            const begin = blockPosition(vectorArgument(call, 0));
            const end = blockPosition(vectorArgument(call, 1));
            const destination = blockPosition(vectorArgument(call, 2));
            const mode = call.args[3];
            const filter = filterOf(call, call.args[4]);
            const low = { x: Math.min(begin.x, end.x), y: Math.min(begin.y, end.y), z: Math.min(begin.z, end.z) };
            const size = {
                x: Math.abs(end.x - begin.x) + 1,
                y: Math.abs(end.y - begin.y) + 1,
                z: Math.abs(end.z - begin.z) + 1
            };
            const { min, max } = world.heightRange(call.state);
            for (const corner of [low, destination, { ...destination, y: destination.y + size.y - 1 }]) {
                if (corner.y < min || corner.y >= max) {
                    const error = outsideWorld(corner);
                    throw new ScriptApiError(
                        error.errorModule,
                        error.errorClass,
                        `One of the provided locations caused the operation to go out of world bounds.. ${error.message}`
                    );
                }
            }
            const overlaps = (['x', 'y', 'z'] as const).every(
                (axis) => low[axis] < destination[axis] + size[axis] && destination[axis] < low[axis] + size[axis]
            );
            // `CloneMode.ForceCopy` is 1.
            if (overlaps && mode !== 1) throw plainError('Source and destination can not overlap.');
            const copied: {
                readonly from: ScriptVector3;
                readonly to: ScriptVector3;
                readonly block: ScriptBlockPermutation;
            }[] = [];
            for (let x = 0; x < size.x; x++)
                for (let y = 0; y < size.y; y++)
                    for (let z = 0; z < size.z; z++) {
                        const from = { x: low.x + x, y: low.y + y, z: low.z + z };
                        const block = world.block(call.state, from);
                        if (block === undefined || !passes(block, system().blockTags(block.typeId), filter)) continue;
                        copied.push({
                            from,
                            to: { x: destination.x + x, y: destination.y + y, z: destination.z + z },
                            block
                        });
                    }
            // `CloneMode.Move` is 2: what moved leaves air behind.
            const air = world.resolveBlock('minecraft:air', {});
            if (mode === 2 && air !== undefined) for (const { from } of copied) world.setBlock(call.state, from, air);
            for (const { to, block } of copied) world.setBlock(call.state, to, block);
            return undefined;
        });
};
