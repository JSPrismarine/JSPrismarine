/**
 * The members of a `Dimension` that write and search its blocks, read its light and biomes, cast
 * rays, and spawn items, experience and explosions, with `BiomeTypes` and `BiomeType`.
 *
 * Block searches and rays read the world's blocks one at a time through {@link ScriptWorld.block}
 * and ask the world system what each type is to them. The `dimension-blocks` scenario recorded
 * how BDS chooses: a search up or down, and a ray, counts the block it starts in; a passable block
 * such as short grass counts unless `includePassableBlocks` is false; a liquid counts only with
 * `includeLiquidBlocks`, and water is passable too; `getTopmostBlock` counts only solid blocks.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import type { BlockKey } from '../serverObjects';
import {
    blockPosition,
    COMMON,
    entityKeyOf,
    itemOf,
    outsideWorld,
    permutationOf,
    plainError,
    SERVER,
    TAG,
    unloadedChunk,
    vectorArgument,
    withNamespace
} from '../serverObjects';
import type { ScriptBlockPermutation, ScriptVector3 } from '../world';
import type { ScriptBlockKind } from './seam';
import { worldSystemOf } from './serverWorld';
import { WORLD_TAG } from './tags';

/** How far a ray or a search goes when a script gives no `maxDistance`. */
const UNBOUNDED = 1024;

/** The options a block search or a ray reads. */
interface BlockQuery {
    readonly includeLiquidBlocks?: boolean;
    readonly includePassableBlocks?: boolean;
    readonly maxDistance?: number;
}

/** Whether a block a search or a ray passes stops it. */
const stops = (kind: ScriptBlockKind, query: BlockQuery): boolean => {
    switch (kind) {
        case 'air':
            return false;
        case 'solid':
            return true;
        case 'passable':
            return query.includePassableBlocks !== false;
        case 'liquid':
            return query.includeLiquidBlocks === true && query.includePassableBlocks !== false;
    }
};

/** Reads an options argument the binding checked is an object, as plain data. */
const optionsOf = (call: ScriptCall, index: number): Readonly<Record<string, unknown>> => {
    const value = call.args[index];
    if (!(value instanceof ScriptHandle)) return {};
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
};

const queryOf = (call: ScriptCall, index: number): BlockQuery => {
    const options = optionsOf(call, index);
    const flag = (key: string) => (typeof options[key] === 'boolean' ? options[key] : undefined);
    const distance = typeof options.maxDistance === 'number' ? options.maxDistance : undefined;
    return {
        ...(flag('includeLiquidBlocks') === undefined ? {} : { includeLiquidBlocks: flag('includeLiquidBlocks') }),
        ...(flag('includePassableBlocks') === undefined
            ? {}
            : { includePassableBlocks: flag('includePassableBlocks') }),
        ...(distance === undefined ? {} : { maxDistance: distance })
    };
};

/** BDS's error for an argument it refuses, at an index. */
const invalidArgument = (index: number, message: string): ScriptApiError =>
    new ScriptApiError(COMMON, 'InvalidArgumentError', `Invalid value passed to argument [${index}]. ${message}`, {
        index
    });

/** The face a ray enters a block through, by the axis it crossed and the way it moves. */
const ENTRY_FACES = {
    x: ['West', 'East'],
    y: ['Down', 'Up'],
    z: ['North', 'South']
} as const;

type Axis = keyof typeof ENTRY_FACES;
const AXES: readonly Axis[] = ['x', 'y', 'z'];

const f32 = Math.fround;

/** A direction scaled to length 1 in 32-bit floats, or undefined for a zero vector. */
const unit = ({ x, y, z }: ScriptVector3): ScriptVector3 | undefined => {
    const length = Math.hypot(x, y, z);
    if (!(length > 0)) return undefined;
    return { x: f32(x / length), y: f32(y / length), z: f32(z / length) };
};

/** One block a ray passes through: where it is, the face it came in by, and how far along the ray that was. */
interface RayStep {
    readonly block: ScriptVector3;
    readonly face: string | undefined;
    readonly distance: number;
}

/**
 * The blocks a ray passes through, in order, starting with the one it starts in: a voxel walk
 * along a unit direction, up to `maxDistance` blocks of travel.
 */
function* rayBlocks(start: ScriptVector3, direction: ScriptVector3, maxDistance: number): Generator<RayStep> {
    const block = blockPosition(start);
    let distance = 0;
    let face: string | undefined;
    const next: Record<Axis, number> = { x: Infinity, y: Infinity, z: Infinity };
    const step: Record<Axis, number> = { x: Infinity, y: Infinity, z: Infinity };
    for (const axis of AXES) {
        const along = direction[axis];
        if (along === 0) continue;
        const edge = along > 0 ? block[axis] + 1 : block[axis];
        next[axis] = (edge - start[axis]) / along;
        step[axis] = Math.abs(1 / along);
    }
    const at = { ...block };
    while (distance <= maxDistance) {
        yield { block: { ...at }, face, distance };
        const axis = AXES.reduce((best, each) => (next[each] < next[best] ? each : best));
        distance = next[axis];
        if (!Number.isFinite(distance)) return;
        const forward = direction[axis] > 0;
        at[axis] += forward ? 1 : -1;
        face = ENTRY_FACES[axis][forward ? 0 : 1];
        next[axis] += step[axis];
    }
}

/** Where a ray meets a box, as its distance along the ray, or undefined when it misses. */
const rayBox = (
    start: ScriptVector3,
    direction: ScriptVector3,
    min: ScriptVector3,
    max: ScriptVector3
): number | undefined => {
    let near = 0;
    let far = Infinity;
    for (const axis of AXES) {
        const along = direction[axis];
        if (along === 0) {
            if (start[axis] < min[axis] || start[axis] > max[axis]) return undefined;
            continue;
        }
        const one = (min[axis] - start[axis]) / along;
        const two = (max[axis] - start[axis]) / along;
        near = Math.max(near, Math.min(one, two));
        far = Math.min(far, Math.max(one, two));
        if (near > far) return undefined;
    }
    return near;
};

/**
 * Registers a dimension's block, light, biome, ray, spawn and explosion members, and the biome
 * types.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementDimension = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const system = () => worldSystemOf(host);
    const blockObject = (key: BlockKey): ScriptHandle =>
        host.engine.release(host.create('Block', TAG.block, JSON.stringify(key)));
    const biomeObject = (id: string): ScriptHandle => host.instance('BiomeType', WORLD_TAG.biomeType, id);
    /** What the block at a location is, or undefined when its chunk is not loaded or it is outside the world. */
    const kindAt = (dimension: string, location: ScriptVector3): ScriptBlockKind | undefined => {
        const { min, max } = world.heightRange(dimension);
        if (location.y < min || location.y >= max) return undefined;
        const permutation = world.block(dimension, location);
        return permutation === undefined ? undefined : system().blockKind(permutation.typeId);
    };
    /** Whether a location is inside the dimension's height range. */
    const inWorld = (dimension: string, { y }: ScriptVector3): boolean => {
        const { min, max } = world.heightRange(dimension);
        return y >= min && y < max;
    };
    /** A location a write or a spawn may use: inside the world, in a loaded chunk. */
    const usable = (call: ScriptCall, index: number): ScriptVector3 => {
        const location = vectorArgument(call, index);
        if (!inWorld(call.state, blockPosition(location))) throw outsideWorld(location);
        if (world.block(call.state, blockPosition(location)) === undefined) throw unloadedChunk(location);
        return location;
    };
    /** Writes a block, as `setBlockType` and `setBlockPermutation` do: nothing outside the world. */
    const write = (call: ScriptCall, permutation: ScriptBlockPermutation): void => {
        const location = blockPosition(vectorArgument(call, 0));
        // BDS writes nothing and throws nothing above or below the world.
        if (!inWorld(call.state, location)) return;
        if (world.block(call.state, location) === undefined) throw unloadedChunk(vectorArgument(call, 0));
        world.setBlock(call.state, location, permutation);
    };
    /** Searches straight up or down from a location, counting the block it starts in. */
    const scan = (call: ScriptCall, way: 1 | -1): ScriptValue => {
        const start = blockPosition(vectorArgument(call, 0));
        const query = queryOf(call, 1);
        const { min, max } = world.heightRange(call.state);
        const reach = query.maxDistance ?? UNBOUNDED;
        for (let offset = 0; offset <= reach; offset++) {
            const location = { ...start, y: start.y + offset * way };
            if (location.y < min || location.y >= max) return undefined;
            const kind = kindAt(call.state, location);
            if (kind === undefined) return undefined;
            if (stops(kind, query)) return blockObject({ dimension: call.state, ...location });
        }
        return undefined;
    };
    /** The block a ray first stops at, with the face it came in by and where on that face. */
    const castBlocks = (
        dimension: string,
        start: ScriptVector3,
        direction: ScriptVector3,
        query: BlockQuery
    ): { readonly block: ScriptVector3; readonly face: string; readonly distance: number } | undefined => {
        for (const { block, face, distance } of rayBlocks(start, direction, query.maxDistance ?? UNBOUNDED)) {
            const kind = kindAt(dimension, block);
            if (kind === undefined) return undefined;
            // A ray that starts in a liquid is already in it and does not stop there.
            if (kind === 'liquid' && face === undefined) continue;
            if (stops(kind, query)) {
                const dominant = AXES.reduce((best, axis) =>
                    Math.abs(direction[axis]) > Math.abs(direction[best]) ? axis : best
                );
                return {
                    block,
                    face: face ?? ENTRY_FACES[dominant][direction[dominant] > 0 ? 0 : 1],
                    distance
                };
            }
        }
        return undefined;
    };
    /** A plain object in the pack's realm, for an interface whose members are objects. */
    const plainObject = (entries: Readonly<Record<string, ScriptValue>>): ScriptHandle => {
        const made = host.engine.evaluate('({})');
        if (!(made instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
        for (const [key, value] of Object.entries(entries)) host.engine.set(made, key, value);
        return made;
    };
    const arrayOf = (values: readonly ScriptValue[]): ScriptHandle => {
        const array = host.engine.evaluate('[]');
        if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        values.forEach((value, index) => host.engine.set(array, String(index), value));
        return host.engine.release(array);
    };
    const parsed = (value: string): ScriptValue => {
        const made = host.engine.evaluate(`(${value})`);
        return made instanceof ScriptHandle ? host.engine.release(made) : made;
    };

    implementations
        .implement(SERVER, 'Dimension', 'setBlockType', (call) => {
            const [, type] = call.args;
            const typeId = withNamespace(type instanceof ScriptHandle ? call.stateOf(type) : String(type));
            const resolved = world.resolveBlock(typeId, {});
            if (resolved === undefined) throw plainError(`Block type ${typeId} not found.`);
            write(call, resolved);
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'setBlockPermutation', (call) => {
            write(call, permutationOf(call.stateOf(call.args[1] ?? null)));
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'getBlockAbove', (call) => scan(call, 1))
        .implement(SERVER, 'Dimension', 'getBlockBelow', (call) => scan(call, -1))
        .implement(SERVER, 'Dimension', 'getTopmostBlock', (call) => {
            const json = call.stringify(call.args[0]);
            // The engine wrote the string with JSON.stringify; the binding checked it is a VectorXZ.
            const xz: unknown = json === undefined ? undefined : JSON.parse(json);
            const read = (key: 'x' | 'z'): number =>
                typeof xz === 'object' && xz !== null && key in xz ? Math.floor(Number(Reflect.get(xz, key))) : 0;
            const x = read('x');
            const z = read('z');
            const { min, max } = world.heightRange(call.state);
            const [from] = call.args.slice(1);
            const top = typeof from === 'number' ? Math.min(Math.floor(from), max - 1) : max - 1;
            if (world.block(call.state, { x, y: max - 1, z }) === undefined) throw unloadedChunk({ x, y: max - 1, z });
            for (let y = top; y >= min; y--) {
                if (kindAt(call.state, { x, y, z }) === 'solid') return blockObject({ dimension: call.state, x, y, z });
            }
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'getBlockFromRay', (call) => {
            const start = vectorArgument(call, 0);
            const direction = unit(vectorArgument(call, 1));
            if (direction === undefined) return undefined;
            const hit = castBlocks(call.state, start, direction, queryOf(call, 2));
            if (hit === undefined) return undefined;
            const point = (axis: Axis) => f32(start[axis] + f32(direction[axis] * f32(hit.distance)));
            const fraction = (axis: Axis) => f32(point(axis) - Math.floor(point(axis)));
            const result = plainObject({
                block: blockObject({ dimension: call.state, ...hit.block }),
                face: hit.face
            });
            host.engine.set(
                result,
                'faceLocation',
                parsed(JSON.stringify({ x: fraction('x'), y: fraction('y'), z: fraction('z') }))
            );
            return host.engine.release(result);
        })
        .implement(SERVER, 'Dimension', 'getEntitiesFromRay', (call) => {
            const start = vectorArgument(call, 0);
            const direction = unit(vectorArgument(call, 1));
            if (direction === undefined) return arrayOf([]);
            const options = optionsOf(call, 2);
            const reach = typeof options.maxDistance === 'number' ? options.maxDistance : UNBOUNDED;
            const wall =
                options.ignoreBlockCollision === true
                    ? undefined
                    : castBlocks(call.state, start, direction, {
                          ...(typeof options.includeLiquidBlocks === 'boolean'
                              ? { includeLiquidBlocks: options.includeLiquidBlocks }
                              : {}),
                          includePassableBlocks: options.includePassableBlocks === true,
                          maxDistance: reach
                      });
            const hits = world
                .entities(call.state)
                .flatMap((entity) => {
                    const box = system().entityBox(entity.id);
                    const distance = box === undefined ? undefined : rayBox(start, direction, box.min, box.max);
                    if (distance === undefined || distance > reach) return [];
                    if (wall !== undefined && wall.distance < distance) return [];
                    return [{ entity, distance }];
                })
                .sort((one, two) => one.distance - two.distance);
            return arrayOf(
                hits.map(({ entity, distance }) =>
                    host.engine.release(
                        plainObject({
                            entity: host.entity({ id: entity.id, typeId: entity.typeId }),
                            distance: f32(distance)
                        })
                    )
                )
            );
        })
        .implement(SERVER, 'Dimension', 'getEntitiesAtBlockLocation', (call) => {
            const at = blockPosition(vectorArgument(call, 0));
            return arrayOf(
                world
                    .entities(call.state)
                    .filter(({ location }) => {
                        const block = blockPosition(location);
                        return block.x === at.x && block.y === at.y && block.z === at.z;
                    })
                    .map((entity) => host.entity({ id: entity.id, typeId: entity.typeId }))
            );
        })
        .implement(
            SERVER,
            'Dimension',
            'getLightLevel',
            (call) => system().light(call.state, blockPosition(vectorArgument(call, 0)))?.level ?? 15
        )
        .implement(
            SERVER,
            'Dimension',
            'getSkyLightLevel',
            (call) => system().light(call.state, blockPosition(vectorArgument(call, 0)))?.sky ?? 15
        )
        .implement(SERVER, 'Dimension', 'getBiome', (call) => {
            const location = vectorArgument(call, 0);
            if (!inWorld(call.state, blockPosition(location))) throw outsideWorld(location);
            const biome = system().biome(call.state, blockPosition(location));
            if (biome === undefined) throw unloadedChunk(location);
            return biomeObject(biome);
        })
        .implement(SERVER, 'Dimension', 'calculateClosestBiomeFromSeed', (call) => {
            const [wanted] = call.args.slice(1);
            const biome = withNamespace(wanted instanceof ScriptHandle ? call.stateOf(wanted) : String(wanted));
            if (
                !system()
                    .biomes()
                    .some(({ id }) => id === biome)
            ) {
                throw invalidArgument(1, `Biome ${biome} cannot be found.`);
            }
            const from = vectorArgument(call, 0);
            const found = system().findBiome(call.state, biome, from);
            if (found === undefined) return undefined;
            const bounds = optionsOf(call, 2).boundingSize;
            if (typeof bounds === 'object' && bounds !== null) {
                const size = (axis: Axis) => Number(Reflect.get(bounds, axis));
                if (AXES.some((axis) => Math.abs(found[axis] - from[axis]) > size(axis) / 2)) return undefined;
            }
            return JSON.stringify(found);
        })
        .implement(SERVER, 'Dimension', 'spawnItem', (call) => {
            const location = usable(call, 1);
            const id = system().spawnItem(call.state, itemOf(call.stateOf(call.args[0] ?? null)), location);
            if (id === undefined) throw plainError('Failed to spawn item.');
            return host.entity({ id, typeId: 'minecraft:item' });
        })
        .implement(SERVER, 'Dimension', 'spawnXp', (call) => {
            system().spawnXp(call.state, usable(call, 0), Number(call.args[1]));
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'createExplosion', (call) => {
            const location = usable(call, 0);
            const radius = Number(call.args[1]);
            if (radius <= 0) return false;
            const options = optionsOf(call, 2);
            const sourceHandle =
                call.args[2] instanceof ScriptHandle ? call.engine.get(call.args[2], 'source') : undefined;
            const source = sourceHandle instanceof ScriptHandle ? call.stateOf(sourceHandle) : '';
            if (sourceHandle instanceof ScriptHandle) call.engine.free(sourceHandle);
            const sourceId = source === '' ? undefined : entityKeyOf(source).id;
            system().explode(call.state, location, {
                radius,
                breaksBlocks: options.breaksBlocks !== false,
                causesFire: options.causesFire === true,
                allowUnderwater: options.allowUnderwater === true,
                ...(typeof sourceId === 'string' ? { source: sourceId } : {})
            });
            return true;
        })
        .implement(SERVER, 'Dimension', 'placeFeature', (call) => {
            const name = String(call.args[0]);
            const location = vectorArgument(call, 1);
            const placed = system().placeFeature(call.state, name, location, false);
            if (placed === 'unknown') throw invalidArgument(0, `Feature name ${name} cannot be found in the registry`);
            if (!placed && call.args[2] === true) throw plainError(`Failed to place feature ${name}.`);
            return placed;
        })
        .implement(SERVER, 'Dimension', 'placeFeatureRule', (call) => {
            const name = String(call.args[0]);
            const placed = system().placeFeature(call.state, name, vectorArgument(call, 1), true);
            if (placed === 'unknown') throw invalidArgument(0, `Feature rule ${name} cannot be found`);
            return placed;
        })
        .implement(SERVER, 'Dimension', 'getGeneratedStructures', (call) => {
            const location = vectorArgument(call, 0);
            if (!inWorld(call.state, blockPosition(location))) throw outsideWorld(location);
            if (world.block(call.state, blockPosition(location)) === undefined) throw unloadedChunk(location);
            return arrayOf(system().generatedStructures(call.state, blockPosition(location)));
        })
        .implement(SERVER, 'BiomeTypes', 'get', (call) => {
            const id = withNamespace(String(call.args[0]));
            return system()
                .biomes()
                .some((biome) => biome.id === id)
                ? biomeObject(id)
                : undefined;
        })
        .implement(SERVER, 'BiomeTypes', 'getAll', () =>
            arrayOf(
                system()
                    .biomes()
                    .map(({ id }) => biomeObject(id))
            )
        )
        .implement(SERVER, 'BiomeType', 'id', { get: (call) => call.state })
        .implement(SERVER, 'BiomeType', 'getTags', (call) =>
            JSON.stringify(
                system()
                    .biomes()
                    .find(({ id }) => id === call.state)?.tags ?? []
            )
        )
        .implement(SERVER, 'BiomeType', 'hasTags', (call) => {
            const tags =
                system()
                    .biomes()
                    .find(({ id }) => id === call.state)?.tags ?? [];
            const json = call.stringify(call.args[0]);
            // The engine wrote the string with JSON.stringify; the binding checked it is a string array.
            const wanted: unknown = json === undefined ? [] : JSON.parse(json);
            return Array.isArray(wanted) && wanted.every((tag) => tags.includes(String(tag)));
        });
};
