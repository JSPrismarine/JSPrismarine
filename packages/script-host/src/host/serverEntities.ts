/**
 * The `@minecraft/server` members of entities and players: `Entity`, `Player`, an entity's
 * inventory and its container, the queries of `World` and `Dimension` that find them, spawning,
 * and running a command as a dimension or an entity.
 *
 * An entity object carries the entity's id and type ({@link EntityKey}), and every member reads
 * the world through {@link ScriptWorld.entity}, one call for all of an entity's fields. Once the
 * entity is gone, `isValid` is false, `id` and `typeId` still answer, and every other member
 * throws BDS's `InvalidEntityError`, as the `entities` scenario recorded.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import { componentFacts, containerSlots, entityComponent, slotPastEnd, writeContainerSlot } from './serverComponents';
import type { EntityAccess, EntityKey } from './serverObjects';
import {
    COMMON,
    entityKeyOf,
    gameModeOf,
    invalidEntity,
    itemOf,
    itemState,
    plainError,
    readMessage,
    SERVER,
    TAG,
    unloadedChunk,
    vectorArgument,
    withNamespace
} from './serverObjects';
import type {
    ScriptCommandResult,
    ScriptCommandSource,
    ScriptDamageSource,
    ScriptEntityRef,
    ScriptEntityState,
    ScriptItem,
    ScriptVector3
} from './world';
import { isRecord } from '../isRecord';

/** The `EntityQueryOptions` fields the host filters by. */
export interface EntityQuery {
    readonly type?: string;
    readonly excludeTypes?: readonly string[];
    readonly name?: string;
    readonly excludeNames?: readonly string[];
    readonly tags?: readonly string[];
    readonly excludeTags?: readonly string[];
    readonly location?: ScriptVector3;
    readonly maxDistance?: number;
    readonly minDistance?: number;
    /** Keeps this many entities nearest `location`, nearest first. */
    readonly closest?: number;
    /** Keeps this many entities farthest from `location`, farthest first. */
    readonly farthest?: number;
}

const distance = (from: ScriptVector3, to: ScriptVector3): number =>
    Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);

/**
 * Filters entities by the basic `EntityQueryOptions`: type, name and tags, each with its
 * exclusion, distance from a location, and the closest or farthest few. Entities keep the order
 * the world gave them unless `closest` or `farthest` sorts them.
 */
export const queryEntities = (
    entities: readonly ScriptEntityState[],
    query: EntityQuery
): readonly ScriptEntityState[] => {
    const type = query.type === undefined ? undefined : withNamespace(query.type);
    const excludeTypes = (query.excludeTypes ?? []).map(withNamespace);
    const { location } = query;
    const matched = entities.filter((entity) => {
        if (type !== undefined && entity.typeId !== type) return false;
        if (excludeTypes.includes(entity.typeId)) return false;
        const name = entity.name ?? entity.nameTag;
        if (query.name !== undefined && name !== query.name) return false;
        if ((query.excludeNames ?? []).includes(name)) return false;
        if (!(query.tags ?? []).every((tag) => entity.tags.includes(tag))) return false;
        if ((query.excludeTags ?? []).some((tag) => entity.tags.includes(tag))) return false;
        if (location !== undefined) {
            const away = distance(location, entity.location);
            if (query.maxDistance !== undefined && away > query.maxDistance) return false;
            if (query.minDistance !== undefined && away < query.minDistance) return false;
        }
        return true;
    });
    if (location === undefined || (query.closest === undefined && query.farthest === undefined)) return matched;
    const near = [...matched].sort((a, b) => distance(location, a.location) - distance(location, b.location));
    if (query.closest !== undefined) return near.slice(0, query.closest);
    return near.reverse().slice(0, query.farthest);
};

/** Reads an `EntityQueryOptions` argument, which the engine copies as JSON. */
const queryArgument = (call: ScriptCall, index: number): EntityQuery => {
    const value = call.args[index];
    if (value === undefined) return {};
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    if (!isRecord(parsed)) return {};
    const text = (key: string): string | undefined => (typeof parsed[key] === 'string' ? parsed[key] : undefined);
    const number = (key: string): number | undefined => (typeof parsed[key] === 'number' ? parsed[key] : undefined);
    const list = (key: string): readonly string[] | undefined => {
        const found = parsed[key];
        return Array.isArray(found) ? found.filter((each) => typeof each === 'string') : undefined;
    };
    const location = parsed.location;
    const vector =
        isRecord(location) &&
        typeof location.x === 'number' &&
        typeof location.y === 'number' &&
        typeof location.z === 'number'
            ? { x: location.x, y: location.y, z: location.z }
            : undefined;
    const query: { -readonly [Key in keyof EntityQuery]: EntityQuery[Key] } = {};
    const fields = {
        type: text('type'),
        name: text('name'),
        excludeTypes: list('excludeTypes'),
        excludeNames: list('excludeNames'),
        tags: list('tags'),
        excludeTags: list('excludeTags'),
        location: vector,
        maxDistance: number('maxDistance'),
        minDistance: number('minDistance'),
        closest: number('closest'),
        farthest: number('farthest')
    };
    for (const [key, field] of Object.entries(fields)) if (field !== undefined) Object.assign(query, { [key]: field });
    return query;
};

/** A `CommandResult` for a command that ran, or BDS's `CommandError` for one that failed. */
const commandResult = (host: PackHost, result: ScriptCommandResult): ScriptHandle => {
    if ('error' in result) {
        throw new ScriptApiError(SERVER, 'CommandError', `Error occurred with parsing command params: ${result.error}`);
    }
    return host.engine.release(host.create('CommandResult', TAG.commandResult, String(result.successCount)));
};

/** Runs a script's command, which BDS takes with or without its slash. */
const runCommand = (host: PackHost, command: ScriptValue, source: ScriptCommandSource): ScriptHandle => {
    const text = String(command).trim();
    return commandResult(host, host.world.runCommand(text.startsWith('/') ? text.slice(1) : text, source));
};

/** Builds a script array of entity objects, which the caller returns. */
const entityArray = (host: PackHost, entities: readonly ScriptEntityState[]): ScriptHandle => {
    const array = host.engine.evaluate('[]');
    if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    entities.forEach((entity, index) => host.engine.set(array, String(index), host.entity(entity)));
    return host.engine.release(array);
};

/** The direction an entity with a rotation looks in, as a unit vector, as BDS works it out. */
export const viewDirection = ({ x: pitch, y: yaw }: { readonly x: number; readonly y: number }): ScriptVector3 => {
    const radians = Math.PI / 180;
    const level = Math.cos(pitch * radians);
    // BDS keeps the parts as 32-bit floats; a zero stays positive.
    const part = (value: number): number => Math.fround(value) + 0;
    return {
        x: part(-Math.sin(yaw * radians) * level),
        y: part(-Math.sin(pitch * radians)),
        z: part(Math.cos(yaw * radians) * level)
    };
};

/** The slot range of a player's hotbar, which `selectedSlotIndex` takes. */
const HOTBAR = { min: 0, max: 8 } as const;

/** Whether two stacks merge into one slot: the same type, name, lore and dynamic properties. */
const stacksWith = (a: ScriptItem, b: ScriptItem): boolean =>
    a.typeId === b.typeId &&
    a.nameTag === b.nameTag &&
    JSON.stringify(a.lore ?? []) === JSON.stringify(b.lore ?? []) &&
    (a.damage ?? 0) === (b.damage ?? 0) &&
    (a.dynamicProperties?.size ?? 0) === 0 &&
    (b.dynamicProperties?.size ?? 0) === 0;

/**
 * Where `Container.addItem` puts a stack: onto the stacks it merges with, in slot order, then
 * into the empty slots, in slot order, as the `entity-members` scenario recorded on BDS.
 * @param most - How many items one slot of the stack's type holds.
 * @returns Each slot it changes with the stack the slot then holds, and what did not fit.
 */
export const placeItem = (
    slots: readonly (ScriptItem | null)[],
    item: ScriptItem,
    most: number
): { readonly writes: ReadonlyMap<number, ScriptItem>; readonly left: number } => {
    const writes = new Map<number, ScriptItem>();
    let left = item.amount;
    slots.forEach((slot, index) => {
        if (left <= 0 || slot === null || !stacksWith(slot, item) || slot.amount >= most) return;
        const moved = Math.min(left, most - slot.amount);
        writes.set(index, { ...slot, amount: slot.amount + moved });
        left -= moved;
    });
    slots.forEach((slot, index) => {
        if (left <= 0 || slot !== null) return;
        const moved = Math.min(left, most);
        writes.set(index, { ...item, amount: moved });
        left -= moved;
    });
    return { writes, left };
};

/**
 * Registers the entity and player members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementEntities = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const keyOf = (call: ScriptCall): EntityKey => entityKeyOf(call.state);
    /** The entity now, or BDS's error for a member of one that is gone. */
    const live = (call: ScriptCall, access: EntityAccess, member: string): ScriptEntityState => {
        const entity = world.entity(keyOf(call).id);
        if (entity === undefined) throw invalidEntity(access, member);
        return entity;
    };
    const players = (): ScriptEntityState[] =>
        world.players().flatMap((id) => {
            const player = world.entity(id);
            return player === undefined ? [] : [player];
        });
    const textArgument = (call: ScriptCall): string => String(call.args[0]);

    implementations
        .implement(SERVER, 'World', 'getAllPlayers', () => entityArray(host, players()))
        .implement(SERVER, 'World', 'getPlayers', (call) => {
            const query = queryArgument(call, 0);
            // BDS runs the query as a player selector, which refuses a type.
            if (query.type !== undefined || query.excludeTypes !== undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'CommandError',
                    'Error occurred with parsing command params: Type argument applied to player-only selector'
                );
            }
            return entityArray(host, queryEntities(players(), query));
        })
        .implement(SERVER, 'World', 'getEntity', (call) => {
            const id = String(call.args[0]);
            // BDS reads the id as a whole number, the one `Entity.id` writes.
            if (!/^-?\d+$/.test(id)) throw plainError(`Entity id '${id}' is invalid.`);
            const entity = world.entity(id);
            return entity === undefined ? undefined : host.entity(entity);
        })
        .implement(SERVER, 'Dimension', 'getPlayers', (call) => {
            const query = queryArgument(call, 0);
            if (query.type !== undefined || query.excludeTypes !== undefined) {
                throw new ScriptApiError(
                    SERVER,
                    'CommandError',
                    'Error occurred with parsing command params: Type argument applied to player-only selector'
                );
            }
            const here = players().filter((player) => player.dimension === call.state);
            return entityArray(host, queryEntities(here, query));
        })
        .implement(SERVER, 'Dimension', 'getEntities', (call) =>
            entityArray(host, queryEntities(world.entities(call.state), queryArgument(call, 0)))
        )
        .implement(SERVER, 'Dimension', 'spawnEntity', (call) => {
            const [identifier] = call.args;
            if (typeof identifier !== 'string')
                throw new ScriptHostErrors.ArgumentNotOfType({ argument: 'entity type', type: 'string' });
            const typeId = withNamespace(identifier);
            const location = vectorArgument(call, 1);
            const spawned = world.spawnEntity(call.state, typeId, location);
            if (spawned === 'unknown-type') {
                throw new ScriptApiError(
                    COMMON,
                    'InvalidArgumentError',
                    `Invalid value passed to argument [0]. '${typeId}' is not a valid entity type.`
                );
            }
            if (spawned === 'unloaded') throw unloadedChunk(location);
            return host.entity({ id: spawned, typeId });
        })
        .implement(SERVER, 'Dimension', 'runCommand', (call) =>
            runCommand(host, call.args[0], { dimension: call.state })
        )
        .implement(SERVER, 'Entity', 'id', { get: (call) => keyOf(call).id })
        .implement(SERVER, 'Entity', 'typeId', { get: (call) => keyOf(call).typeId })
        .implement(SERVER, 'Entity', 'isValid', { get: (call) => world.entity(keyOf(call).id) !== undefined })
        .implement(SERVER, 'Entity', 'location', {
            get: (call) => JSON.stringify(live(call, 'get', 'location').location)
        })
        .implement(SERVER, 'Entity', 'dimension', {
            get: (call) => host.instance('Dimension', TAG.dimension, live(call, 'get', 'dimension').dimension)
        })
        .implement(SERVER, 'Entity', 'nameTag', {
            // BDS words a read of a gone entity's name tag as a set, as the `entities` scenario recorded.
            get: (call) => live(call, 'set', 'nameTag').nameTag,
            set: (call) => world.setNameTag(live(call, 'set', 'nameTag').id, String(call.args[0]))
        })
        .implement(SERVER, 'Entity', 'addTag', (call) =>
            world.addTag(live(call, 'call', 'addTag').id, textArgument(call))
        )
        .implement(SERVER, 'Entity', 'removeTag', (call) =>
            world.removeTag(live(call, 'call', 'removeTag').id, textArgument(call))
        )
        .implement(SERVER, 'Entity', 'hasTag', (call) => live(call, 'call', 'hasTag').tags.includes(textArgument(call)))
        .implement(SERVER, 'Entity', 'getTags', (call) => JSON.stringify(live(call, 'call', 'getTags').tags))
        .implement(SERVER, 'Entity', 'teleport', (call) => {
            const entity = live(call, 'call', 'teleport');
            const options = call.args[1];
            let dimension = '';
            if (options instanceof ScriptHandle) {
                const target = call.engine.get(options, 'dimension');
                dimension = call.stateOf(target ?? null);
                if (target instanceof ScriptHandle) call.engine.free(target);
            }
            world.teleport(entity.id, dimension === '' ? entity.dimension : dimension, vectorArgument(call, 0));
            return undefined;
        })
        .implement(SERVER, 'Entity', 'kill', (call) => world.kill(live(call, 'call', 'kill').id))
        .implement(SERVER, 'Entity', 'remove', (call) => {
            world.remove(live(call, 'call', 'remove').id);
            return undefined;
        })
        .implement(SERVER, 'Entity', 'runCommand', (call) =>
            runCommand(host, call.args[0], { entity: live(call, 'call', 'runCommand').id })
        )
        .implement(SERVER, 'Entity', 'getComponent', (call) => {
            live(call, 'call', 'getComponent');
            // A component the host has no behavior for reads as one the entity lacks.
            return entityComponent(host, keyOf(call), String(call.args[0]));
        })
        .implement(SERVER, 'Entity', 'getRotation', (call) =>
            JSON.stringify(live(call, 'call', 'getRotation').rotation ?? { x: 0, y: 0 })
        )
        .implement(SERVER, 'Entity', 'getHeadLocation', (call) => {
            const entity = live(call, 'call', 'getHeadLocation');
            return JSON.stringify(entity.headLocation ?? entity.location);
        })
        .implement(SERVER, 'Entity', 'getViewDirection', (call) =>
            JSON.stringify(viewDirection(live(call, 'call', 'getViewDirection').rotation ?? { x: 0, y: 0 }))
        )
        .implement(SERVER, 'Entity', 'isSneaking', {
            get: (call) => live(call, 'get', 'isSneaking').sneaking === true,
            set: (call) => world.setSneaking?.(live(call, 'set', 'isSneaking').id, call.args[0] === true)
        })
        .implement(SERVER, 'Entity', 'applyDamage', (call) => {
            const entity = live(call, 'call', 'applyDamage');
            const [amount, options] = call.args;
            return world.applyDamage?.(entity.id, Number(amount), damageSourceArgument(call, options)) ?? false;
        })
        .implement(SERVER, 'Player', 'getGameMode', (call) => live(call, 'call', 'getGameMode').gameMode ?? 'Survival')
        .implement(SERVER, 'Player', 'selectedSlotIndex', {
            get: (call) => live(call, 'get', 'selectedSlotIndex').selectedSlot ?? 0,
            set: (call) => {
                const player = live(call, 'set', 'selectedSlotIndex');
                const [slot] = call.args;
                const index = typeof slot === 'number' ? Math.trunc(slot) : 0;
                if (index < HOTBAR.min || index > HOTBAR.max) {
                    // BDS names the property `selectedSlot` here, as the `players` scenario recorded.
                    throw new ScriptApiError(
                        COMMON,
                        'PropertyOutOfBoundsError',
                        `Unsupported or out of bounds value set on Property: selectedSlot, Value: ${index}, ` +
                            `Property bounds: [${HOTBAR.min}, ${HOTBAR.max}]`,
                        { value: index, minValue: HOTBAR.min, maxValue: HOTBAR.max }
                    );
                }
                world.setSelectedSlot?.(player.id, index);
            }
        })
        .implement(SERVER, 'Player', 'name', {
            get: (call) => {
                const player = world.entity(keyOf(call).id);
                if (player === undefined) throw plainError("Failed to get property 'name'.");
                return player.name ?? player.nameTag;
            }
        })
        .implement(SERVER, 'Player', 'setGameMode', (call) => {
            const player = live(call, 'call', 'setGameMode');
            const [mode] = call.args;
            // No game mode is the world's default, which a new player gets.
            if (mode !== undefined) world.setGameMode?.(player.id, gameModeOf(mode));
            return undefined;
        })
        .implement(SERVER, 'Player', 'sendMessage', (call) => {
            const player = live(call, 'call', 'sendMessage');
            world.sendMessage(readMessage(call.engine, call.args[0]), player.id);
            return undefined;
        });
    implementInventory(implementations, host);
};

/**
 * Reads an `EntityApplyDamageOptions` or `EntityApplyDamageByProjectileOptions` argument, whose
 * entities are objects the host made. With none, the cause is `none`, as on BDS.
 */
const damageSourceArgument = (call: ScriptCall, options: ScriptValue | undefined): ScriptDamageSource => {
    if (!(options instanceof ScriptHandle)) return { cause: 'none' };
    const read = (key: string): ScriptValue | undefined => {
        const found = call.engine.get(options, key);
        if (!(found instanceof ScriptHandle)) return found;
        // A handle the source keeps only by its state, which outlives the handle.
        const state = call.stateOf(found);
        call.engine.free(found);
        return state;
    };
    const entityOf = (key: string): ScriptEntityRef | undefined => {
        const state = read(key);
        if (typeof state !== 'string' || state === '') return undefined;
        const { id, typeId } = entityKeyOf(state);
        return { id, typeId };
    };
    const cause = read('cause');
    const damagingEntity = entityOf('damagingEntity');
    const damagingProjectile = entityOf('damagingProjectile');
    return {
        cause: typeof cause === 'string' ? cause : damagingProjectile === undefined ? 'none' : 'projectile',
        ...(damagingEntity === undefined ? {} : { damagingEntity }),
        ...(damagingProjectile === undefined ? {} : { damagingProjectile })
    };
};

/**
 * The inventory components and their container. An entity's names its entity by its key, and a
 * block's names its block by its position, as the `block-inventory` scenario reads a chest's.
 */
const implementInventory = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    /** The slots of the container an object's state names, or undefined once it is gone. */
    const slotsOf = (state: string) => containerSlots(world, state);
    const writeSlot = (state: string, slot: number, item: ScriptItem | undefined): void =>
        writeContainerSlot(world, state, slot, item);
    /**
     * The container's slots, or BDS's error for a member of a container that is gone: `Failed to
     * get property 'size'.` for a property and `Failed to call function 'addItem'.` for a method.
     */
    const slots = (call: ScriptCall, member: string, access: 'get' | 'call' = 'get') => {
        const found = slotsOf(call.state);
        if (found === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return found;
    };
    const slotArgument = (call: ScriptCall, size: number): number => {
        const [slot] = call.args;
        const index = typeof slot === 'number' ? Math.trunc(slot) : -1;
        if (index >= size) throw slotPastEnd(index, size);
        return index;
    };

    implementations
        .implement(SERVER, 'Component', 'typeId', {
            get: (call) =>
                call.tag === TAG.inventory || call.tag === TAG.blockInventory
                    ? 'minecraft:inventory'
                    : call.tag === TAG.durability
                      ? 'minecraft:durability'
                      : (componentFacts(world, call.tag, call.state)?.typeId ?? '')
        })
        .implement(SERVER, 'Component', 'isValid', {
            get: (call) => {
                if (call.tag === TAG.durability) return true;
                const facts = componentFacts(world, call.tag, call.state);
                if (facts !== undefined) return facts.isValid;
                if (call.tag === TAG.blockInventory) return slotsOf(call.state) !== undefined;
                return world.entity(entityKeyOf(call.state).id) !== undefined;
            }
        })
        .implement(SERVER, 'BlockInventoryComponent', 'container', {
            get: (call) => {
                if (slotsOf(call.state) === undefined) throw plainError("Failed to get property 'container'.");
                return host.engine.release(host.create('Container', TAG.container, call.state));
            }
        })
        .implement(SERVER, 'EntityInventoryComponent', 'container', {
            get: (call) => {
                if (world.inventory(entityKeyOf(call.state).id) === undefined) {
                    throw plainError("Failed to get property 'container'.");
                }
                return host.engine.release(host.create('Container', TAG.container, call.state));
            }
        })
        .implement(SERVER, 'Container', 'isValid', { get: (call) => slotsOf(call.state) !== undefined })
        .implement(SERVER, 'Container', 'size', { get: (call) => slots(call, 'size').length })
        .implement(SERVER, 'Container', 'emptySlotsCount', {
            get: (call) => slots(call, 'emptySlotsCount').filter((slot) => slot === null).length
        })
        .implement(SERVER, 'Container', 'getItem', (call) => {
            const all = slots(call, 'getItem', 'call');
            const item = all[slotArgument(call, all.length)];
            if (item === undefined || item === null) return undefined;
            return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(item)));
        })
        .implement(SERVER, 'Container', 'addItem', (call) => {
            const all = slots(call, 'addItem', 'call');
            const stack = call.args[0];
            if (!(stack instanceof ScriptHandle)) return undefined;
            const item = itemOf(call.stateOf(stack));
            const most = world.itemType(item.typeId)?.maxStackSize ?? item.amount;
            const { writes, left } = placeItem(all, item, Math.max(1, most));
            for (const [slot, written] of writes) writeSlot(call.state, slot, written);
            if (left <= 0) return undefined;
            return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState({ ...item, amount: left })));
        })
        .implement(SERVER, 'Container', 'setItem', (call) => {
            const all = slots(call, 'setItem', 'call');
            const slot = slotArgument(call, all.length);
            const stack = call.args[1];
            const item = stack instanceof ScriptHandle ? itemOf(call.stateOf(stack)) : undefined;
            writeSlot(call.state, slot, item);
            return undefined;
        });
};
