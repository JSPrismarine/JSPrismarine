/**
 * The `@minecraft/server` members of `Entity` that read and move an entity beyond
 * `serverEntities.ts`'s: its motion and states, its box, the blocks it stands on and looks at, the
 * entities it looks at, its properties and definition events, fire, rotation, `tryTeleport`,
 * `matches` and `addItem`, and `EntityTypes`.
 *
 * The values and errors follow the `entity-values` scenario recorded on the pinned Bedrock
 * Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { placeItem, queryEntities, viewDirection } from '../serverEntities';
import type { EntityKey } from '../serverObjects';
import {
    COMMON,
    entityKeyOf,
    invalidEntity,
    itemOf,
    itemState,
    outsideWorld,
    PLAYER,
    SERVER,
    TAG,
    vectorArgument,
    withNamespace
} from '../serverObjects';
import type { ScriptEntityState, ScriptVector3 } from '../world';
import { scriptArray } from './components';
import type { ScriptEntityProperty, ScriptEntityStatus, ScriptEntitySystems } from './world';

/** What a script set on an entity that only scripts read: its name plate's settings. */
interface NameplateState {
    depthTested: boolean;
    renderDistance: number;
}

/** BDS's name plate settings before a script changes them, as the `entity-values` scenario recorded. */
const NAMEPLATE_DEFAULTS: NameplateState = { depthTested: false, renderDistance: 64 };

/** The name plate settings of each world's entities, which every pack of the world shares. */
const nameplates = new WeakMap<object, Map<string, NameplateState>>();

/** The blocks a ray passes through that it does not stop at unless asked. */
const LIQUIDS: ReadonlySet<string> = new Set([
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava'
]);

/** How far `getBlockFromViewDirection` and `getEntitiesFromViewDirection` look when no `maxDistance` is given. */
const VIEW_DISTANCE = { block: 50, entity: 50 } as const;

/** The faces a ray enters a block through, by the axis it crossed and its direction along it. */
const FACES = {
    x: { positive: 'West', negative: 'East' },
    y: { positive: 'Down', negative: 'Up' },
    z: { positive: 'North', negative: 'South' }
} as const;

/** One block a ray entered, with the face it came in through and where. */
export interface RayBlock {
    readonly block: ScriptVector3;
    readonly face: 'Down' | 'East' | 'North' | 'South' | 'Up' | 'West';
    /** Where the ray met the face, relative to the block's lowest corner. */
    readonly faceLocation: ScriptVector3;
    readonly distance: number;
}

/**
 * The blocks a ray passes through, in order, up to `maxDistance`, by a voxel walk.
 * @param visit - Called for each block; returning true stops the walk.
 */
export const walkRay = (
    origin: ScriptVector3,
    direction: ScriptVector3,
    maxDistance: number,
    visit: (hit: RayBlock) => boolean
): void => {
    const axes = ['x', 'y', 'z'] as const;
    const cell = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
    const step = { x: Math.sign(direction.x), y: Math.sign(direction.y), z: Math.sign(direction.z) };
    const delta = {
        x: direction.x === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.x),
        y: direction.y === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.y),
        z: direction.z === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.z)
    };
    const next = { x: 0, y: 0, z: 0 };
    for (const axis of axes) {
        const offset = origin[axis] - cell[axis];
        next[axis] =
            step[axis] > 0
                ? (1 - offset) * delta[axis]
                : step[axis] < 0
                  ? offset * delta[axis]
                  : Number.POSITIVE_INFINITY;
    }
    for (;;) {
        const axis = axes.reduce((best, each) => (next[each] < next[best] ? each : best));
        const distance = next[axis];
        if (distance > maxDistance) return;
        cell[axis] += step[axis];
        next[axis] += delta[axis];
        const at = {
            x: origin.x + direction.x * distance,
            y: origin.y + direction.y * distance,
            z: origin.z + direction.z * distance
        };
        const faceLocation = {
            x: axis === 'x' ? (step.x > 0 ? 0 : 1) : at.x - cell.x,
            y: axis === 'y' ? (step.y > 0 ? 0 : 1) : at.y - cell.y,
            z: axis === 'z' ? (step.z > 0 ? 0 : 1) : at.z - cell.z
        };
        const face = FACES[axis][step[axis] > 0 ? 'positive' : 'negative'];
        if (visit({ block: { ...cell }, face, faceLocation, distance })) return;
    }
};

/** Where a ray meets a box, as a distance along it, or undefined when it misses. */
export const rayBoxDistance = (
    origin: ScriptVector3,
    direction: ScriptVector3,
    box: { readonly min: ScriptVector3; readonly max: ScriptVector3 }
): number | undefined => {
    let near = 0;
    let far = Number.POSITIVE_INFINITY;
    for (const axis of ['x', 'y', 'z'] as const) {
        if (direction[axis] === 0) {
            if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return undefined;
            continue;
        }
        const a = (box.min[axis] - origin[axis]) / direction[axis];
        const b = (box.max[axis] - origin[axis]) / direction[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return undefined;
    }
    return near;
};

/** Whether two boxes share any space. */
const boxesOverlap = (
    a: { readonly min: ScriptVector3; readonly max: ScriptVector3 },
    b: { readonly min: ScriptVector3; readonly max: ScriptVector3 }
): boolean =>
    a.min.x < b.max.x &&
    b.min.x < a.max.x &&
    a.min.y < b.max.y &&
    b.min.y < a.max.y &&
    a.min.z < b.max.z &&
    b.min.z < a.max.z;

/** The localization key of an entity type, as BDS names it: `entity.<name>.name`. */
export const localizationKeyOf = (typeId: string): string =>
    `entity.${typeId.startsWith('minecraft:') ? typeId.slice('minecraft:'.length) : typeId}.name`;

/** Reads an options argument the engine copies as JSON, or an empty record without one. */
export const optionsOf = (call: ScriptCall, index: number): Readonly<Record<string, unknown>> => {
    const value = call.args[index];
    if (value === undefined || value === null) return {};
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    return isRecord(parsed) ? parsed : {};
};

/** The checked value of an entity property write, or BDS's error for one its definition refuses. */
const propertyWrite = (
    typeId: string,
    name: string,
    property: ScriptEntityProperty | undefined,
    value: unknown
): number | boolean | string => {
    if (property === undefined) {
        throw new ScriptApiError(
            COMMON,
            'InvalidArgumentError',
            `Invalid value passed to argument [0]. Property "${name}" does not exist on Entity of type "${typeId}".`,
            { index: 0 }
        );
    }
    const wrongType = (expected: string, index: number) =>
        new ScriptApiError(
            COMMON,
            'InvalidArgumentError',
            `Invalid type passed to argument [${index}]. Expected type: ${expected} property`,
            { index }
        );
    if (property.type === 'enum') {
        if (typeof value !== 'string') throw wrongType('string', 0);
        if (!(property.values ?? []).includes(value)) throw wrongType('enum', 1);
        return value;
    }
    if (property.type === 'bool') {
        if (typeof value !== 'boolean') throw wrongType('bool', 0);
        return value;
    }
    if (typeof value !== 'number') throw wrongType(property.type, 0);
    const written = property.type === 'int' ? Math.trunc(value) : value;
    const [min, max] = property.range ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    if (written < min || written > max) {
        throw new ScriptApiError(
            COMMON,
            'ArgumentOutOfBoundsError',
            `Unsupported or out of bounds value passed to function argument [1]: value, Value: ${written}, Argument bounds: [${min}, ${max}]`,
            { index: 1, value: written, minValue: min, maxValue: max }
        );
    }
    return written;
};

/**
 * Registers the entity members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementEntityMembers = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const systems = (): ScriptEntitySystems | undefined => world.entitySystems;
    const live = (call: ScriptCall, access: 'get' | 'set' | 'call', member: string): ScriptEntityState => {
        const key = entityKeyOf(call.state);
        const entity = world.entity(key.id);
        if (entity === undefined) throw invalidEntity(access, member, key);
        return entity;
    };
    /** The entity's status, or BDS's error for an entity that is gone or a world that keeps none. */
    const status = (call: ScriptCall, access: 'get' | 'call', member: string): ScriptEntityStatus => {
        const key = entityKeyOf(call.state);
        const found = systems()?.status(key.id);
        if (found === undefined) throw invalidEntity(access, member, key);
        return found;
    };
    const statusField = (member: string, pick: (status: ScriptEntityStatus) => boolean) =>
        // Each row names a boolean property of `Entity`, which the generated types cannot check through the loop.
        implementations.implement(
            SERVER,
            'Entity',
            member as never,
            {
                get: (call: ScriptCall) => pick(status(call, 'get', member))
            } as never
        );
    statusField('isOnGround', (each) => each.onGround);
    statusField('isInWater', (each) => each.inWater);
    statusField('isClimbing', (each) => each.climbing);
    statusField('isSleeping', (each) => each.sleeping);
    statusField('isSprinting', (each) => each.sprinting);
    statusField('isSwimming', (each) => each.swimming);
    statusField('isFalling', (each) => !each.onGround && each.velocity.y < 0);

    const nameplateOf = (id: string): NameplateState => {
        const all = nameplates.get(world) ?? new Map<string, NameplateState>();
        nameplates.set(world, all);
        const found = all.get(id) ?? { ...NAMEPLATE_DEFAULTS };
        all.set(id, found);
        return found;
    };
    const blockObject = (dimension: string, location: ScriptVector3): ScriptHandle =>
        host.engine.release(host.create('Block', TAG.block, JSON.stringify({ dimension, ...location })));
    const isSolid = (dimension: string, location: ScriptVector3, liquids: boolean): boolean => {
        const block = world.block(dimension, location);
        if (block === undefined || block.typeId === 'minecraft:air') return false;
        return liquids || !LIQUIDS.has(block.typeId);
    };
    const standingOn = (entity: ScriptEntityState, box: ScriptEntityStatus['box']): ScriptVector3[] => {
        const y = Math.floor(entity.location.y - 0.01);
        const found: ScriptVector3[] = [];
        for (let x = Math.floor(box.min.x); x <= Math.floor(box.max.x - 1e-7); x++) {
            for (let z = Math.floor(box.min.z); z <= Math.floor(box.max.z - 1e-7); z++) {
                if (isSolid(entity.dimension, { x, y, z }, true)) found.push({ x, y, z });
            }
        }
        return found;
    };
    const array = (items: readonly ScriptHandle[]): ScriptHandle => scriptArray(host, items);
    const eyes = (entity: ScriptEntityState): ScriptVector3 => entity.headLocation ?? entity.location;
    const familiesOf = (id: string): readonly string[] => {
        const family = systems()?.components(id)?.get('minecraft:type_family');
        const list = isRecord(family) ? family.family : undefined;
        return Array.isArray(list) ? list.filter((each) => typeof each === 'string') : [];
    };
    const propertiesOf = (call: ScriptCall, access: 'call', member: string) => {
        const key = entityKeyOf(call.state);
        const found = systems()?.properties(key.id);
        if (found === undefined) throw invalidEntity(access, member, key);
        return { key, properties: found };
    };

    implementations
        .implement(SERVER, 'Entity', 'getVelocity', (call) =>
            JSON.stringify(status(call, 'call', 'getVelocity').velocity)
        )
        .implement(SERVER, 'Entity', 'getAABB', (call) => {
            const { box } = status(call, 'call', 'getAABB');
            const half = (axis: 'x' | 'y' | 'z') => (box.max[axis] - box.min[axis]) / 2;
            return JSON.stringify({
                center: { x: box.min.x + half('x'), y: box.min.y + half('y'), z: box.min.z + half('z') },
                extent: { x: half('x'), y: half('y'), z: half('z') }
            });
        })
        .implement(SERVER, 'Entity', 'target', {
            get: (call) => {
                const target = status(call, 'get', 'target').target;
                const entity = target === undefined ? undefined : world.entity(target);
                return entity === undefined ? undefined : host.entity(entity);
            }
        })
        .implement(SERVER, 'Entity', 'localizationKey', {
            get: (call) => localizationKeyOf(live(call, 'get', 'localizationKey').typeId)
        })
        .implement(SERVER, 'Entity', 'nameplateDepthTested', {
            get: (call) => nameplateOf(live(call, 'get', 'nameplateDepthTested').id).depthTested,
            set: (call) => {
                nameplateOf(live(call, 'set', 'nameplateDepthTested').id).depthTested = call.args[0] === true;
            }
        })
        .implement(SERVER, 'Entity', 'nameplateRenderDistance', {
            get: (call) => nameplateOf(live(call, 'get', 'nameplateRenderDistance').id).renderDistance,
            set: (call) => {
                nameplateOf(live(call, 'set', 'nameplateRenderDistance').id).renderDistance = Number(call.args[0]);
            }
        })
        .implement(SERVER, 'Entity', 'applyImpulse', (call) => {
            const entity = live(call, 'call', 'applyImpulse');
            systems()?.applyImpulse(entity.id, vectorArgument(call, 0));
            return undefined;
        })
        .implement(SERVER, 'Entity', 'clearVelocity', (call) => {
            systems()?.clearVelocity(live(call, 'call', 'clearVelocity').id);
            return undefined;
        })
        .implement(SERVER, 'Entity', 'applyKnockback', (call) => {
            const entity = live(call, 'call', 'applyKnockback');
            const horizontal = optionsOf(call, 0);
            systems()?.applyKnockback(
                entity.id,
                { x: Number(horizontal.x ?? 0), z: Number(horizontal.z ?? 0) },
                Number(call.args[1] ?? 0)
            );
            return undefined;
        })
        .implement(SERVER, 'Entity', 'setRotation', (call) => {
            const entity = live(call, 'call', 'setRotation');
            const rotation = optionsOf(call, 0);
            systems()?.setRotation(entity.id, { x: Number(rotation.x ?? 0), y: Number(rotation.y ?? 0) });
            return undefined;
        })
        .implement(SERVER, 'Entity', 'lookAt', (call) => {
            const entity = live(call, 'call', 'lookAt');
            const target = vectorArgument(call, 0);
            const from = entity.typeId === PLAYER ? eyes(entity) : entity.location;
            const dx = target.x - from.x;
            const dy = target.y - from.y;
            const dz = target.z - from.z;
            const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
            const pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
            systems()?.setRotation(entity.id, { x: pitch + 0, y: yaw + 0 });
            return undefined;
        })
        .implement(SERVER, 'Entity', 'setOnFire', (call) => {
            const entity = live(call, 'call', 'setOnFire');
            const seconds = Math.trunc(Number(call.args[0]));
            return systems()?.setOnFire(entity.id, Math.max(0, seconds) * 20) ?? false;
        })
        .implement(SERVER, 'Entity', 'extinguishFire', (call) => {
            systems()?.extinguishFire(live(call, 'call', 'extinguishFire').id);
            // BDS returns true whether or not the entity burned, as the `entity-values` scenario recorded.
            return true;
        })
        .implement(SERVER, 'Entity', 'playAnimation', (call) => {
            const entity = live(call, 'call', 'playAnimation');
            const options = optionsOf(call, 1);
            const text = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined);
            systems()?.playAnimation(entity.id, {
                name: String(call.args[0]),
                ...(text('nextState') === undefined ? {} : { nextState: text('nextState') }),
                ...(typeof options.blendOutTime === 'number' ? { blendOutTime: options.blendOutTime } : {}),
                ...(text('stopExpression') === undefined ? {} : { stopExpression: text('stopExpression') }),
                ...(text('controller') === undefined ? {} : { controller: text('controller') })
            });
            return undefined;
        })
        .implement(SERVER, 'Entity', 'triggerEvent', (call) => {
            const entity = live(call, 'call', 'triggerEvent');
            const event = String(call.args[0]);
            if (systems()?.triggerEvent(entity.id, event) !== true) {
                throw new ScriptApiError(
                    COMMON,
                    'InvalidArgumentError',
                    `Invalid value passed to argument [0]. The event ${event} does not exist on ${entity.typeId}`,
                    { index: 0 }
                );
            }
            return undefined;
        })
        .implement(SERVER, 'Entity', 'getProperty', (call) => {
            const { properties } = propertiesOf(call, 'call', 'getProperty');
            return properties.get(String(call.args[0]))?.value;
        })
        .implement(SERVER, 'Entity', 'setProperty', (call) => {
            const { key, properties } = propertiesOf(call, 'call', 'setProperty');
            const name = String(call.args[0]);
            const value = propertyWrite(key.typeId, name, properties.get(name), call.args[1]);
            systems()?.setProperty(key.id, name, value);
            return undefined;
        })
        .implement(SERVER, 'Entity', 'resetProperty', (call) => {
            const { key, properties } = propertiesOf(call, 'call', 'resetProperty');
            const name = String(call.args[0]);
            const property = properties.get(name);
            if (property === undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'Error',
                    `Property "${name}" does not exist on Entity of type "${key.typeId}".`
                );
            }
            systems()?.setProperty(key.id, name, property.defaultValue);
            return property.defaultValue;
        })
        .implement(SERVER, 'Entity', 'tryTeleport', (call) => {
            const entity = live(call, 'call', 'tryTeleport');
            const location = vectorArgument(call, 0);
            const options = call.args[1];
            let dimension = entity.dimension;
            let checkForBlocks = false;
            if (options instanceof ScriptHandle) {
                const target = call.engine.get(options, 'dimension');
                const state = call.stateOf(target ?? null);
                if (target instanceof ScriptHandle) call.engine.free(target);
                if (state !== '') dimension = state;
                checkForBlocks = call.engine.get(options, 'checkForBlocks') === true;
            }
            const range = world.heightRange(dimension);
            if (location.y < range.min || location.y > range.max) throw outsideWorld(location);
            if (checkForBlocks) {
                const box = systems()?.status(entity.id)?.box;
                const height = box === undefined ? 1 : box.max.y - box.min.y;
                for (let y = Math.floor(location.y); y <= Math.floor(location.y + height - 1e-7); y++) {
                    if (isSolid(dimension, { x: Math.floor(location.x), y, z: Math.floor(location.z) }, false))
                        return false;
                }
            }
            world.teleport(entity.id, dimension, location);
            return true;
        })
        .implement(SERVER, 'Entity', 'matches', (call) => {
            const entity = live(call, 'call', 'matches');
            const options = optionsOf(call, 0);
            const list = (key: string) =>
                Array.isArray(options[key]) ? options[key].filter((each) => typeof each === 'string') : [];
            const families = familiesOf(entity.id);
            if (!list('families').every((family) => families.includes(family))) return false;
            if (list('excludeFamilies').some((family) => families.includes(family))) return false;
            const text = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined);
            const number = (key: string) => (typeof options[key] === 'number' ? options[key] : undefined);
            const location = isRecord(options.location) ? options.location : undefined;
            const query = {
                ...(text('type') === undefined ? {} : { type: text('type') }),
                ...(text('name') === undefined ? {} : { name: text('name') }),
                excludeTypes: list('excludeTypes'),
                excludeNames: list('excludeNames'),
                tags: list('tags'),
                excludeTags: list('excludeTags'),
                ...(location === undefined
                    ? {}
                    : { location: { x: Number(location.x), y: Number(location.y), z: Number(location.z) } }),
                ...(number('maxDistance') === undefined ? {} : { maxDistance: number('maxDistance') }),
                ...(number('minDistance') === undefined ? {} : { minDistance: number('minDistance') })
            };
            return queryEntities([entity], query).length === 1;
        })
        .implement(SERVER, 'Entity', 'getBlockStandingOn', (call) => {
            const entity = live(call, 'call', 'getBlockStandingOn');
            const found = status(call, 'call', 'getBlockStandingOn');
            if (!found.onGround) return undefined;
            const below = standingOn(entity, found.box);
            const nearest = below.sort(
                (a, b) =>
                    Math.hypot(a.x + 0.5 - entity.location.x, a.z + 0.5 - entity.location.z) -
                    Math.hypot(b.x + 0.5 - entity.location.x, b.z + 0.5 - entity.location.z)
            )[0];
            return nearest === undefined ? undefined : blockObject(entity.dimension, nearest);
        })
        .implement(SERVER, 'Entity', 'getAllBlocksStandingOn', (call) => {
            const entity = live(call, 'call', 'getAllBlocksStandingOn');
            const found = status(call, 'call', 'getAllBlocksStandingOn');
            if (!found.onGround) return array([]);
            return array(standingOn(entity, found.box).map((block) => blockObject(entity.dimension, block)));
        })
        .implement(SERVER, 'Entity', 'getBlockFromViewDirection', (call) => {
            const entity = live(call, 'call', 'getBlockFromViewDirection');
            const options = optionsOf(call, 0);
            const maxDistance = typeof options.maxDistance === 'number' ? options.maxDistance : VIEW_DISTANCE.block;
            const liquids = options.includeLiquidBlocks === true;
            const direction = viewDirection(entity.rotation ?? { x: 0, y: 0 });
            let hit: RayBlock | undefined;
            walkRay(eyes(entity), direction, maxDistance, (each) => {
                if (!isSolid(entity.dimension, each.block, liquids)) return false;
                hit = each;
                return true;
            });
            if (hit === undefined) return undefined;
            const result = host.engine.evaluate('({})');
            if (!(result instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
            host.engine.set(result, 'block', blockObject(entity.dimension, hit.block));
            host.engine.set(result, 'face', hit.face);
            const faceLocation = host.engine.evaluate(`(${JSON.stringify(hit.faceLocation)})`);
            if (faceLocation instanceof ScriptHandle) {
                host.engine.set(result, 'faceLocation', faceLocation);
                host.engine.free(faceLocation);
            }
            return host.engine.release(result);
        })
        .implement(SERVER, 'Entity', 'getEntitiesFromViewDirection', (call) => {
            const entity = live(call, 'call', 'getEntitiesFromViewDirection');
            const options = optionsOf(call, 0);
            const maxDistance = typeof options.maxDistance === 'number' ? options.maxDistance : VIEW_DISTANCE.entity;
            const origin = eyes(entity);
            const direction = viewDirection(entity.rotation ?? { x: 0, y: 0 });
            let blocked = maxDistance;
            if (options.ignoreBlockCollision !== true) {
                walkRay(origin, direction, maxDistance, (each) => {
                    if (!isSolid(entity.dimension, each.block, options.includeLiquidBlocks === true)) return false;
                    blocked = each.distance;
                    return true;
                });
            }
            const own = systems()?.status(entity.id)?.box;
            const hits = world
                .entities(entity.dimension)
                .filter((other) => other.id !== entity.id)
                .flatMap((other) => {
                    const box = systems()?.status(other.id)?.box;
                    // An entity that overlaps the looker is not one it sees, as BDS returned none for a player in a crowd.
                    if (box === undefined || (own !== undefined && boxesOverlap(own, box))) return [];
                    const distance = rayBoxDistance(origin, direction, box);
                    return distance === undefined || distance > blocked ? [] : [{ other, distance }];
                })
                .sort((a, b) => a.distance - b.distance);
            return array(
                hits.map(({ other, distance }) => {
                    const hit = host.engine.evaluate('({})');
                    if (!(hit instanceof ScriptHandle))
                        throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
                    host.engine.set(hit, 'entity', host.entity(other));
                    host.engine.set(hit, 'distance', Math.fround(distance));
                    return host.engine.release(hit);
                })
            );
        })
        .implement(SERVER, 'Entity', 'addItem', (call) => {
            const entity = live(call, 'call', 'addItem');
            const slots = entity.inventorySize === undefined ? undefined : world.inventory(entity.id);
            if (slots === undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'InvalidEntityComponentError',
                    'Attempting to access invalid entity component minecraft:inventory.'
                );
            }
            const stack = call.args[0];
            if (!(stack instanceof ScriptHandle)) return undefined;
            const item = itemOf(call.stateOf(stack));
            const most = world.itemType(item.typeId)?.maxStackSize ?? item.amount;
            const { writes, left } = placeItem(slots, item, Math.max(1, most));
            for (const [slot, written] of writes) world.setInventoryItem(entity.id, slot, written);
            if (left <= 0) return undefined;
            return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState({ ...item, amount: left })));
        });

    const typeObject = (id: string): ScriptHandle => host.engine.release(host.create('EntityType', TAG.entityType, id));
    const types = (): readonly string[] => systems()?.entityTypes() ?? [];
    implementations
        .implement(SERVER, 'EntityTypes', 'get', (call) => {
            const id = withNamespace(String(call.args[0]));
            return types().includes(id) ? typeObject(id) : undefined;
        })
        .implement(SERVER, 'EntityTypes', 'getAll', () => array(types().map(typeObject)))
        .implement(SERVER, 'EntityType', 'localizationKey', { get: (call) => localizationKeyOf(call.state) });
};

/** The entity an `Entity` argument names, or undefined for any other value. */
export const entityArgument = (call: ScriptCall, index: number): EntityKey | undefined => {
    const value = call.args[index];
    if (!(value instanceof ScriptHandle)) return undefined;
    const state = call.stateOf(value);
    return state === '' ? undefined : entityKeyOf(state);
};
