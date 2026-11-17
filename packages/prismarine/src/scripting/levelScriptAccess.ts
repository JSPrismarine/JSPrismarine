/**
 * What a level's behavior pack scripts read and write of its entities, blocks, items and
 * commands, over the server's own setters and command verbs, so a script's write is the write a
 * command makes ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 * Everything leaves as plain data: ids, positions, type ids and states.
 *
 * Entities are found in the level's built worlds by runtime id, which is the id scripts know them
 * by. A player's inventory is their session's; no other entity has one a script can reach yet.
 */
import type { ScriptLevelAccess } from './LevelScriptWorld';
import type {
    ScriptBlockPermutation,
    ScriptCommandResult,
    ScriptCommandSource,
    ScriptEntityState,
    ScriptItem
} from '@jsprismarine/script-host/host/world';

import { getGametypeId } from '@jsprismarine/minecraft';
import { readMcStructure } from '@jsprismarine/structures/bedrockTemplate';
import { NBTTagCompound } from '@jsprismarine/nbt';

import type { StoreActor } from '../entity/data/storeActors';
import ContainerEntry from '../inventory/ContainerEntry';
import type { Item } from '../item/Item';
import { maxStackSizeOf } from '../item/Item';
import { itemFromContent } from '../item/itemFromContent';
import type PlayerSession from '../network/PlayerSession';
import type Server from '../Server';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import type { DynamicProperties, DynamicPropertyValue } from '../world/dynamicProperties';
import {
    DYNAMIC_PROPERTIES_TAG,
    dynamicPropertiesFromNbt,
    dynamicPropertiesToNbt,
    withPropertyWrites
} from '../world/dynamicProperties';
import { scriptScoreboard } from './scriptScoreboard';

/** A slot's stack as a script reads it, or null for an empty one. */
const scriptItemOf = (item: Item | null): ScriptItem | null => {
    if (item === null || item.getName() === 'minecraft:air' || item.getAmount() <= 0) return null;
    const nameTag = item.getCustomName();
    const lore = item.getLore();
    return {
        typeId: item.getName(),
        amount: item.getAmount(),
        ...(nameTag === undefined ? {} : { nameTag }),
        ...(lore.length === 0 ? {} : { lore })
    };
};

/**
 * Builds the access of one level's scripts.
 * @param server - The server whose content, sessions and commands the scripts reach.
 * @param level - The level the scripts run in.
 */
export const levelScriptAccess = (server: Server, level: Level): ScriptLevelAccess => {
    /** Whether an actor is in the world: alive, or of a type with no health, such as a minecart. */
    const present = (actor: StoreActor): boolean => actor.isAlive() || actor.getMaxHealth() <= 0;
    const worldOf = (dimension: string): World | undefined =>
        [...level.worlds()].find((world) => world.getDimension().bedrockName === dimension);
    const actorOf = (id: string): StoreActor | undefined => {
        if (!/^\d+$/.test(id)) return undefined;
        for (const world of level.worlds()) {
            const actor = world.getActor(BigInt(id));
            if (actor !== null && present(actor)) return actor;
        }
        return undefined;
    };
    const sessionOf = (id: string): PlayerSession | undefined =>
        server
            .getSessionManager()
            .getSessions()
            .find((session) => String(session.runtimeId) === id && session.getWorld().getLevel() === level);
    const stateOf = (actor: StoreActor): ScriptEntityState => {
        const id = String(actor.getRuntimeId());
        const session = actor.getType() === 'minecraft:player' ? sessionOf(id) : undefined;
        const position = actor.getPosition();
        const name = session?.identity.name;
        return {
            id,
            typeId: actor.getType(),
            dimension: actor.getWorld().getDimension().bedrockName,
            location: { x: position.getX(), y: actor.getFeetY(), z: position.getZ() },
            // A player's name tag is their name, as on BDS.
            nameTag: actor.getName() === '' && name !== undefined ? name : actor.getName(),
            tags: actor.getTags(),
            ...(name === undefined ? {} : { name }),
            ...(session === undefined ? {} : { inventorySize: session.getPlayer().getInventory().getSlotCount() })
        };
    };
    /** The runtime id of the entity in the level whose saved id, its `UniqueID`, is `saved`. */
    const liveActor = (saved: bigint): string | undefined => {
        for (const world of level.worlds()) {
            for (const actor of world.getActors()) {
                const nbt = present(actor) ? actor.persistentNbt : null;
                if (nbt?.has('UniqueID') === true && nbt.getLong('UniqueID', 0n) === saved) {
                    return String(actor.getRuntimeId());
                }
            }
        }
        return undefined;
    };
    const host = () => server.getCommandManager().getHost();
    const refOf = (actor: StoreActor) => ({
        id: String(actor.getRuntimeId()),
        type: actor.getType(),
        name: actor.getName(),
        isPlayer: actor.getType() === 'minecraft:player',
        position: { x: actor.getPosition().getX(), y: actor.getFeetY(), z: actor.getPosition().getZ() },
        rotation: { yaw: actor.yaw, pitch: actor.pitch },
        dimension: actor.getWorld().getDimension().id
    });
    const javaDimension = (dimension: string): string => worldOf(dimension)?.getDimension().id ?? dimension;

    return {
        entity: (id) => {
            const actor = actorOf(id);
            return actor === undefined ? undefined : stateOf(actor);
        },
        entities: (dimension) => (worldOf(dimension)?.getActors() ?? []).filter(present).map(stateOf),
        spawnEntity: (dimension, typeId, location) => {
            if (!server.getContent().entities.registry.has(typeId)) return 'unknown-type';
            const world = worldOf(dimension);
            const loaded = world?.getLoadedChunk(Math.floor(location.x) >> 4, Math.floor(location.z) >> 4) ?? null;
            if (loaded === null) return 'unloaded';
            const spawned = host().entities.summon(
                typeId,
                location,
                { yaw: 0, pitch: 0 },
                { dimension: javaDimension(dimension) }
            );
            return spawned?.id ?? 'unknown-type';
        },
        teleport: (id, dimension, location) => {
            const actor = actorOf(id);
            if (actor !== undefined) {
                host().entities.teleport(
                    refOf(actor),
                    location,
                    { yaw: actor.yaw, pitch: actor.pitch },
                    javaDimension(dimension)
                );
            }
        },
        kill: (id) => {
            const actor = actorOf(id);
            return actor !== undefined && host().entities.kill(refOf(actor));
        },
        remove: (id) => {
            const actor = actorOf(id);
            actor?.getWorld().dataEntities().runtime.remove(actor.entity.id, 'body removed');
        },
        setNameTag: (id, nameTag) => actorOf(id)?.setName(nameTag),
        addTag: (id, tag) => actorOf(id)?.addTag(tag) ?? false,
        removeTag: (id, tag) => actorOf(id)?.removeTag(tag) ?? false,
        inventory: (id) => {
            const inventory = actorOf(id) === undefined ? undefined : sessionOf(id)?.getPlayer().getInventory();
            if (inventory === undefined) return undefined;
            const slots: (ScriptItem | null)[] = [];
            for (let slot = 0; slot < inventory.getSlotCount(); slot++) {
                slots.push(inventory.isEmpty(slot) ? null : scriptItemOf(inventory.getItem(slot)));
            }
            return slots;
        },
        setInventoryItem: (id, slot, item) => {
            const session = sessionOf(id);
            const inventory = session?.getPlayer().getInventory();
            if (session === undefined || inventory === undefined) return;
            if (item === undefined) inventory.removeItem(slot);
            else {
                const stack = itemFromContent(item.typeId, server.getContent());
                if (stack === null) return;
                const written = stack.withCount(item.amount).withDisplay(item.nameTag, item.lore ?? []);
                inventory.setItem(slot, new ContainerEntry({ item: written, count: item.amount }));
            }
            session.released(session.sendInventory());
        },
        heightRange: (dimension) => {
            const type = worldOf(dimension)?.getDimension();
            // A dimension nobody has entered has no world to read; its blocks read as unloaded.
            return type === undefined ? { min: -64, max: 320 } : { min: type.minY, max: type.minY + type.height };
        },
        block: (dimension, location) => {
            const world = worldOf(dimension);
            if (world === undefined) return undefined;
            const { x, y, z } = location;
            if (world.getLoadedChunk(x >> 4, z >> 4) === null) return undefined;
            const type = world.getDimension();
            // The height just above the top holds air on BDS.
            if (y >= type.minY + type.height) return { typeId: 'minecraft:air', states: {} };
            const found = world.loadedBlockAt(x, y, z);
            return found === undefined ? undefined : { typeId: found.name, states: { ...found.states } };
        },
        setBlock: (dimension, location, permutation) => {
            worldOf(dimension)?.setLoadedBlockState(
                location.x,
                location.y,
                location.z,
                { name: permutation.typeId, states: permutation.states },
                true
            );
        },
        resolveBlock: (typeId, states) => resolveBlock(server, typeId, states),
        itemType: (typeId) =>
            server.getContent().items.types.has(typeId)
                ? { typeId, maxStackSize: maxStackSizeOf(typeId, server.getContent()) }
                : undefined,
        placeStructure: (dimension, location, structure) => {
            const world = worldOf(dimension);
            if (world === undefined) return;
            let template: ReturnType<typeof readMcStructure>;
            try {
                template = readMcStructure(structure);
            } catch (error: unknown) {
                server.getLogger().warn(`A GameTest structure could not be read: ${String(error)}`);
                return;
            }
            for (const { pos, state } of template.blocks) {
                const block = template.palette[state];
                if (block === undefined) continue;
                const [x, y, z] = [location.x + pos[0], location.y + pos[1], location.z + pos[2]];
                if (world.getLoadedChunk(x >> 4, z >> 4) === null) continue;
                world.setLoadedBlockState(x, y, z, { name: block.name, states: block.states }, true);
            }
        },
        setGameMode: (id, gameMode) => {
            const session = sessionOf(id);
            if (session !== undefined) session.released(session.setGamemode(getGametypeId(gameMode.toLowerCase())));
        },
        dynamicProperties: (owner, pack) => {
            if (owner === 'world') return level.getDynamicProperties().of(pack);
            const actor = actorOf(owner.entity);
            return actor === undefined ? undefined : (actorProperties(actor).get(pack) ?? new Map());
        },
        setDynamicProperties: (owner, pack, values) => {
            if (owner === 'world') level.getDynamicProperties().write(pack, values);
            else {
                const actor = actorOf(owner.entity);
                if (actor !== undefined) writeActorProperties(actor, pack, values);
            }
        },
        clearDynamicProperties: (owner, pack) => {
            if (owner === 'world') level.getDynamicProperties().clear(pack);
            else {
                const actor = actorOf(owner.entity);
                const ids = actor === undefined ? [] : [...(actorProperties(actor).get(pack)?.keys() ?? [])];
                if (actor !== undefined && ids.length > 0) {
                    writeActorProperties(actor, pack, new Map(ids.map((id) => [id, undefined])));
                }
            }
        },
        scoreboard: scriptScoreboard(
            level.getScoreboard(),
            (id) => {
                const actor = actorOf(id);
                if (actor === undefined) return undefined;
                const name = actor.getType() === 'minecraft:player' ? sessionOf(id)?.identity.name : undefined;
                const nbt = actor.persistentNbt;
                return {
                    type: name === undefined ? 'Entity' : 'Player',
                    name: name ?? id,
                    ...(nbt?.has('UniqueID') === true ? { saved: nbt.getLong('UniqueID', 0n) } : {})
                };
            },
            liveActor
        ),
        runCommand: (command: string, source: ScriptCommandSource): ScriptCommandResult => {
            const manager = server.getCommandManager();
            if ('dimension' in source)
                return manager.runScriptCommand(command, { dimension: javaDimension(source.dimension) });
            const actor = actorOf(source.entity);
            if (actor === undefined) return { error: 'The entity is gone' };
            return manager.runScriptCommand(command, { entity: actor });
        }
    };
};

/**
 * An entity's dynamic properties, which it keeps in its actor record's `DynamicProperties` tag
 * as BDS does. The record's tags this server does not model are a logged field of the entity, so
 * a write reaches the change log and the next save.
 */
const actorProperties = (actor: StoreActor): DynamicProperties => {
    const tag = actor.persistentNbt?.getCompound(DYNAMIC_PROPERTIES_TAG, false);
    return tag === null || tag === undefined ? new Map() : dynamicPropertiesFromNbt(tag);
};

/** Writes some of one pack's dynamic properties of an entity into its actor record. */
const writeActorProperties = (
    actor: StoreActor,
    pack: string,
    values: ReadonlyMap<string, DynamicPropertyValue | undefined>
): void => {
    const nbt = actor.persistentNbt ?? new NBTTagCompound('');
    const all = new Map(actorProperties(actor));
    const next = withPropertyWrites(all.get(pack), values);
    if (next === undefined) all.delete(pack);
    else all.set(pack, next);
    if (all.size === 0) nbt.remove(DYNAMIC_PROPERTIES_TAG);
    else nbt.addChild(dynamicPropertiesToNbt(all, DYNAMIC_PROPERTIES_TAG));
    actor.persistentNbt = nbt;
};

/**
 * Completes a permutation: a state the script left out takes its default, and a value the state
 * does not allow takes the default too, as on BDS.
 * @returns Undefined for a type the content lacks or a state the type does not have.
 */
const resolveBlock = (
    server: Server,
    typeId: string,
    states: Readonly<Record<string, string | number | boolean>>
): ScriptBlockPermutation | undefined => {
    const type = server.getContent().blocks.types.get(typeId);
    if (type === undefined) return undefined;
    const defaults = type.state().values;
    const allowed: Record<string, string | number | boolean> = {};
    for (const [name, value] of Object.entries(states)) {
        if (!(name in defaults)) return undefined;
        try {
            type.state({ ...allowed, [name]: value });
            allowed[name] = value;
        } catch {
            // A value the state does not allow keeps the default.
        }
    }
    return { typeId, states: { ...type.state(allowed).values } };
};
