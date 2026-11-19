/**
 * What a level's behavior pack scripts read and write of its entities, blocks, items and
 * commands, over the server's own setters and command verbs, so a script's write is the write a
 * command makes ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 * Everything leaves as plain data: ids, positions, type ids and states.
 *
 * Entities are found in the level's built worlds by runtime id, which is the id scripts know them
 * by. A player's inventory is their session's, and any other entity's is the container its
 * `minecraft:inventory` declares, such as a chest minecart's.
 */
import type { ScriptLevelAccess } from './LevelScriptWorld';
import type {
    ScriptBlockPermutation,
    ScriptCommandResult,
    ScriptCommandSource,
    ScriptEntityState,
    ScriptEquipmentSlot,
    ScriptItem
} from '@jsprismarine/script-host/host/world';
import { ATTRIBUTES } from '@jsprismarine/entities/attributes';
import type { AttributeName } from '@jsprismarine/entities/attributes';

import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';
import PlayerHotbarPacket from '@jsprismarine/protocol/packet/PlayerHotbarPacket';
import SpawnParticleEffectPacket from '@jsprismarine/protocol/packet/SpawnParticleEffectPacket';
import { readMcStructure } from '@jsprismarine/structures/bedrockTemplate';
import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound } from '@jsprismarine/nbt';

import type { ContentItemDrop } from '../content/world/adapter';
import { ENTITY_EYE_HEIGHT_FRACTION } from '../entity/data/position';
import type { StoreActor } from '../entity/data/storeActors';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { WindowIds } from '../inventory/WindowIds';
import type Inventory from '../inventory/Inventory';
import { mobEquipmentSlotOf } from '../entity/equipment';
import type { Item } from '../item/Item';
import { maxStackSizeOf } from '../item/Item';
import { itemFromContent } from '../item/itemFromContent';
import type Server from '../Server';
import type { Level } from '../world/Level';
import type { DynamicProperties, DynamicPropertyValue } from '../world/dynamicProperties';
import {
    DYNAMIC_PROPERTIES_TAG,
    dynamicPropertiesFromNbt,
    dynamicPropertiesToNbt,
    withPropertyWrites
} from '../world/dynamicProperties';
import { blockContainerAt } from '../command/host/containers';
import { bedrockMobEffectId, normalizeStatusEffectId } from '../entity/StatusEffect';
import { damageSourceOfScript } from './scriptEntityEvents';
import { containerEntryOf, levelActors, presentActor } from './levelActors';
import { scriptScoreboard } from './scriptScoreboard';
import { levelCatalog } from './blocksItems/levelCatalog';
import { scriptEffectTypes } from '@jsprismarine/bedrock-data/script-catalog';

/** A slot's stack as a script reads it, or null for an empty one. */
export const scriptItemOf = (item: Item | null): ScriptItem | null => {
    if (item === null || item.getName() === 'minecraft:air' || item.getAmount() <= 0) return null;
    const nameTag = item.getCustomName();
    const lore = item.getLore();
    const most = item.getMaxDurability();
    const damage = most > 0 ? Math.max(0, most - item.getDurability()) : 0;
    return {
        typeId: item.getName(),
        amount: item.getAmount(),
        ...(nameTag === undefined ? {} : { nameTag }),
        ...(lore.length === 0 ? {} : { lore }),
        ...(damage > 0 ? { damage } : {})
    };
};

/** A container slot's stack as a script reads it, or null for an empty one. */
const scriptItemOfDrop = (drop: ContentItemDrop | undefined): ScriptItem | null => {
    if (drop === undefined || drop.identifier === 'minecraft:air' || drop.count <= 0) return null;
    return {
        typeId: drop.identifier,
        amount: drop.count,
        ...(drop.customName === undefined ? {} : { nameTag: drop.customName }),
        ...(drop.lore === undefined || drop.lore.length === 0 ? {} : { lore: drop.lore }),
        ...(drop.damage === undefined || drop.damage <= 0 ? {} : { damage: drop.damage })
    };
};

/**
 * A script's stack as a container slot holds it. A stack the slot already held keeps what a
 * script cannot see of it, such as its enchantments and durability, when only its count or its
 * name changed.
 */
const dropOfScriptItem = (item: ScriptItem, held: ContentItemDrop | undefined): ContentItemDrop => {
    const {
        customName: _name,
        lore: _lore,
        damage: _damage,
        ...kept
    } = held?.identifier === item.typeId ? held : { identifier: '' };
    return {
        ...kept,
        identifier: item.typeId,
        count: item.amount,
        ...(item.nameTag === undefined ? {} : { customName: item.nameTag }),
        ...(item.lore === undefined || item.lore.length === 0 ? {} : { lore: item.lore }),
        ...(item.damage === undefined || item.damage <= 0 ? {} : { damage: item.damage })
    };
};

/** The equipment slots of a player's armor container, in the order the client numbers them. */
const ARMOR_ORDER: readonly ScriptEquipmentSlot[] = ['Head', 'Chest', 'Legs', 'Feet'];

/**
 * A player's hunger, saturation and exhaustion, which BDS gives the attribute components
 * `minecraft:player.hunger`, `player.saturation` and `player.exhaustion`: the field each is kept
 * in and its default, as the `entity-attributes` scenario recorded.
 */
const PLAYER_VITALS: Readonly<
    Record<
        string,
        { readonly field: 'vitals.food' | 'vitals.saturation' | 'vitals.exhaustion'; readonly default: number }
    >
> = {
    'minecraft:player.hunger': { field: 'vitals.food', default: 20 },
    'minecraft:player.saturation': { field: 'vitals.saturation', default: 5 },
    'minecraft:player.exhaustion': { field: 'vitals.exhaustion', default: 0 }
};

/** The largest a player's hunger, saturation or exhaustion reads. */
const VITAL_MAX = 20;

/** The attributes BDS gives every mob, whatever its definition says. */
const LIQUID_SPEEDS: ReadonlySet<AttributeName> = new Set(['underwater_movement', 'lava_movement']);

/** A mob's speed in water and in lava when its definition gives it none. */
const LIQUID_SPEED = 0.02;

/** The largest 32-bit float, which bounds an attribute BDS gives no maximum. */
const FLOAT_MAX = 3.4028234663852886e38;

/** A player's game mode as the Script API names it, or undefined for one it has no name for. */
export const gameModeName = (gamemode: number) => {
    try {
        return getGametypeName(gamemode);
    } catch {
        return undefined;
    }
};

/**
 * Builds the access of one level's scripts.
 * @param server - The server whose content, sessions and commands the scripts reach.
 * @param level - The level the scripts run in.
 */
export const levelScriptAccess = (server: Server, level: Level): ScriptLevelAccess => {
    const present = presentActor;
    const { worldOf, actorOf, sessionOf } = levelActors(server, level);
    const stateOf = (actor: StoreActor): ScriptEntityState => {
        const id = String(actor.getRuntimeId());
        const session = actor.getType() === 'minecraft:player' ? sessionOf(id) : undefined;
        const position = actor.getPosition();
        const name = session?.identity.name;
        const feet = actor.getFeetY();
        const eyes = session === undefined ? actor.getBox().height * ENTITY_EYE_HEIGHT_FRACTION : EYE_HEIGHT;
        const player = session?.getPlayer();
        const gameMode = player === undefined ? undefined : gameModeName(player.gamemode);
        const capacity = actor.entity.body.containerCapacity;
        return {
            id,
            typeId: actor.getType(),
            dimension: actor.getWorld().getDimension().bedrockName,
            location: { x: position.getX(), y: actor.getFeetY(), z: position.getZ() },
            // A player's name tag is their name, as on BDS.
            nameTag: actor.getName() === '' && name !== undefined ? name : actor.getName(),
            tags: actor.getTags(),
            ...(name === undefined ? {} : { name }),
            ...(player === undefined
                ? capacity > 0
                    ? { inventorySize: capacity }
                    : {}
                : {
                      inventorySize: player.getInventory().getSlotCount(),
                      selectedSlot: player.getInventory().getHandSlotIndex(),
                      sneaking: player.isSneaking()
                  }),
            ...(gameMode === undefined ? {} : { gameMode }),
            rotation: { x: actor.pitch, y: actor.yaw },
            // BDS keeps a head's height as a 32-bit float.
            headLocation: { x: position.getX(), y: Math.fround(feet + eyes), z: position.getZ() }
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
    const entryOf = (item: ScriptItem) => containerEntryOf(server, item);
    /**
     * An entity's attribute. A mob whose definition gives it no speed in water or lava has BDS's
     * default of 0.02 for each, as the `entity-values` scenario recorded, which is declared on it
     * the first time a script reads it.
     */
    const liquidSpeedOf = (actor: StoreActor | undefined, name: AttributeName) => {
        const attributes = actor?.entity.instance.attributes;
        const found = attributes?.get(name);
        if (found !== undefined || attributes === undefined || !LIQUID_SPEEDS.has(name)) return found;
        const mob = attributes.get('health') !== undefined || attributes.get('movement') !== undefined;
        return mob ? attributes.define(name, { base: LIQUID_SPEED }) : undefined;
    };
    /** The attribute a component id names, such as `health` for `minecraft:health`. */
    const attributeName = (component: string): AttributeName | undefined =>
        ATTRIBUTES.find((name) => `minecraft:${name}` === component);

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
            const actor = actorOf(id);
            if (actor === undefined) return undefined;
            const inventory = sessionOf(id)?.getPlayer().getInventory();
            if (inventory === undefined) {
                const { body } = actor.entity;
                if (body.containerCapacity <= 0) return undefined;
                return Array.from({ length: body.containerCapacity }, (_, slot) =>
                    scriptItemOfDrop(body.containerSlots[slot])
                );
            }
            const slots: (ScriptItem | null)[] = [];
            for (let slot = 0; slot < inventory.getSlotCount(); slot++) {
                slots.push(inventory.isEmpty(slot) ? null : scriptItemOf(inventory.getItem(slot)));
            }
            return slots;
        },
        setInventoryItem: (id, slot, item) => {
            const session = sessionOf(id);
            const inventory = session?.getPlayer().getInventory();
            if (session === undefined || inventory === undefined) {
                const body = actorOf(id)?.entity.body;
                if (body === undefined || slot < 0 || slot >= body.containerCapacity) return;
                const held = body.containerSlots[slot];
                body.setContainerSlot(slot, item === undefined ? undefined : dropOfScriptItem(item, held));
                return;
            }
            if (item === undefined) inventory.removeItem(slot);
            else {
                const entry = entryOf(item);
                if (entry === undefined) return;
                inventory.setItem(slot, entry);
            }
            session.released(session.sendInventory());
        },
        heightRange: (dimension) => {
            // A dimension nobody has entered has no world yet, so its range is its type's.
            const type =
                worldOf(dimension)?.getDimension() ??
                [...level.getStems().keys()]
                    .map((stem) => level.dimensionTypeOf(stem))
                    .find((each) => each.bedrockName === dimension);
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
        catalog: levelCatalog({
            blockTypes: () => server.getContent().blocks.types.keys(),
            itemTypes: () => server.getContent().items.types.keys()
        }),
        blockLight: (dimension, { x, y, z }) => {
            const world = worldOf(dimension);
            if (world === undefined || world.getLoadedChunk(x >> 4, z >> 4) === null) return undefined;
            const systems = world.getSystems();
            return {
                block: systems.getBlockLight?.(x, y, z) ?? systems.lighting.getBlockLight(x, y, z),
                sky: systems.getSkyLight?.(x, y, z) ?? systems.lighting.getSkyLight(x, y, z)
            };
        },
        waterlogged: (dimension, { x, y, z }) => {
            const world = worldOf(dimension);
            if (world === undefined || world.getLoadedChunk(x >> 4, z >> 4) === null) return undefined;
            return world.loadedLiquidAt(x, y, z) !== undefined;
        },
        itemType: (typeId) => {
            const content = server.getContent();
            if (!content.items.types.has(typeId)) return undefined;
            const maxDurability = itemFromContent(typeId, content)?.getMaxDurability() ?? 0;
            return {
                typeId,
                maxStackSize: maxStackSizeOf(typeId, content),
                ...(maxDurability > 0 ? { maxDurability } : {})
            };
        },
        equipment: (id) => {
            // Only a player has equipment a script reaches, as on BDS.
            const inventory = sessionOf(id)?.getPlayer().getInventory();
            if (inventory === undefined) return undefined;
            const held = (container: Inventory, slot: number) =>
                container.isEmpty(slot) ? undefined : (scriptItemOf(container.getItem(slot)) ?? undefined);
            const slots: Partial<Record<ScriptEquipmentSlot, ScriptItem>> = {};
            const read: readonly (readonly [ScriptEquipmentSlot, Inventory, number])[] = [
                ['Mainhand', inventory, inventory.getHandSlotIndex()],
                ['Offhand', inventory.getOffhand(), 0],
                ...ARMOR_ORDER.map((slot, index) => [slot, inventory.getArmor(), index] as const)
            ];
            for (const [slot, container, index] of read) {
                const item = held(container, index);
                if (item !== undefined) slots[slot] = item;
            }
            return { slots, armor: inventory.getArmorDefensePoints(), toughness: inventory.getArmorToughness() };
        },
        setEquipment: (id, slot, item) => {
            const session = sessionOf(id);
            const inventory = session?.getPlayer().getInventory();
            if (session === undefined || inventory === undefined || slot === 'Body') return false;
            const entry = item === undefined ? undefined : entryOf(item);
            if (item !== undefined && entry === undefined) return false;
            const armorSlot = ARMOR_ORDER.indexOf(slot);
            // An armor slot takes only a piece worn there, as the item's `minecraft:wearable` says.
            if (armorSlot >= 0 && entry !== undefined) {
                const worn = entry.getItem().getEquipmentSlot();
                if (worn === undefined || mobEquipmentSlotOf(worn) !== slot.toLowerCase()) return false;
            }
            const [container, index] =
                slot === 'Mainhand'
                    ? [inventory, inventory.getHandSlotIndex()]
                    : slot === 'Offhand'
                      ? [inventory.getOffhand(), 0]
                      : [inventory.getArmor(), armorSlot];
            if (entry === undefined) container.removeItem(index);
            else container.setItem(index, entry);
            session.released(session.sendInventory());
            return true;
        },
        attribute: (id, component) => {
            const vital = PLAYER_VITALS[component];
            if (vital !== undefined) {
                const components = sessionOf(id)?.getPlayer().getComponents();
                if (components === undefined) return undefined;
                return {
                    current: Math.fround(components.get(vital.field)),
                    default: vital.default,
                    min: 0,
                    max: VITAL_MAX
                };
            }
            const name = attributeName(component);
            const found = name === undefined ? undefined : liquidSpeedOf(actorOf(id), name);
            if (found === undefined) return undefined;
            // BDS keeps attributes as 32-bit floats, and bounds a speed only by the largest of them.
            return {
                current: Math.fround(found.current),
                default: Math.fround(found.base),
                min: Math.fround(found.min),
                max: name === 'health' ? Math.fround(found.max) : FLOAT_MAX
            };
        },
        setAttribute: (id, component, value) => {
            const vital = PLAYER_VITALS[component];
            if (vital !== undefined) {
                sessionOf(id)?.getPlayer().getComponents().set(vital.field, value);
                return;
            }
            const name = attributeName(component);
            const attributes = actorOf(id)?.entity.instance.attributes;
            const found = name === undefined ? undefined : liquidSpeedOf(actorOf(id), name);
            if (name === undefined || attributes === undefined || found === undefined) return;
            if (value > found.max) attributes.setMax(name, value);
            attributes.set(name, value);
        },
        dimensionTypes: () =>
            [...level.getDimensionTypes().values()]
                .sort((a, b) => a.bedrockId - b.bedrockId)
                .map((type) => type.bedrockName),
        // BDS lists `minecraft:empty`, the effect with id 0, among its types, as the
        // `entity-components` scenario recorded.
        // The types the pinned BDS lists, minecraft:freezing among them, which has no network id here.
        effectTypes: () => scriptEffectTypes,
        setSneaking: (id, sneaking) => {
            const session = sessionOf(id);
            if (session === undefined) return;
            session.inputs().setPlayerSneaking(session.getPlayer(), sneaking);
        },
        showTitle: (id, title) => {
            const actor = actorOf(id);
            if (actor !== undefined) host().server.sendTitle([refOf(actor)], title);
        },
        playSound: ({ sound, dimension, location, volume, pitch, player }) => {
            const listener = player === undefined ? undefined : actorOf(player);
            const listeners =
                player === undefined
                    ? (worldOf(dimension)?.getActors() ?? []).filter((actor) => actor.getType() === 'minecraft:player')
                    : listener === undefined
                      ? []
                      : [listener];
            host().world.playSound(sound, listeners.map(refOf), location, volume, pitch);
        },
        spawnParticle: (dimension, effect, location, molangVariables, player) => {
            if (player === undefined) {
                host().world.particle(effect, location, javaDimension(dimension), molangVariables);
                return;
            }
            const session = sessionOf(player);
            const world = worldOf(dimension);
            if (session === undefined || world === undefined) return;
            const packet = new SpawnParticleEffectPacket();
            packet.dimensionId = world.getDimension().bedrockId;
            packet.effectName = effect;
            packet.position = new Vector3(location.x, location.y, location.z);
            if (molangVariables !== undefined) packet.molangVariables = molangVariables;
            session.released(session.send(packet));
        },
        isEffectType: (typeId) => bedrockMobEffectId(normalizeStatusEffectId(typeId)) !== undefined,
        effects: (id) =>
            actorOf(id)
                ?.getStatusEffects()
                .map(({ id: typeId, amplifier, durationTicks }) => ({ typeId, amplifier, duration: durationTicks })),
        addEffect: (id, { typeId, amplifier, duration, showParticles }) => {
            actorOf(id)?.addStatusEffect({
                id: typeId,
                amplifier,
                durationTicks: duration,
                showParticles,
                showIcon: showParticles
            });
        },
        removeEffect: (id, typeId) => actorOf(id)?.removeStatusEffect(typeId) ?? false,
        blockInventory: (dimension, location) => {
            const world = worldOf(dimension);
            const container =
                world === undefined
                    ? undefined
                    : blockContainerAt(server, world, new Vector3(location.x, location.y, location.z));
            return container === undefined
                ? undefined
                : Array.from({ length: container.size }, (_, slot) => scriptItemOfDrop(container.get(slot)));
        },
        setBlockInventoryItem: (dimension, location, slot, item) => {
            const world = worldOf(dimension);
            const container =
                world === undefined
                    ? undefined
                    : blockContainerAt(server, world, new Vector3(location.x, location.y, location.z));
            if (container === undefined) return;
            container.set(slot, item === undefined ? undefined : dropOfScriptItem(item, container.get(slot)));
            container.commit();
        },
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
        setSelectedSlot: (id, slot) => {
            const session = sessionOf(id);
            if (session === undefined) return;
            session.getPlayer().getInventory().setHandSlot(slot);
            session.released(
                session.send(
                    new PlayerHotbarPacket({
                        selectedSlot: slot,
                        containerId: WindowIds.INVENTORY,
                        shouldSelectSlot: true
                    })
                )
            );
        },
        applyDamage: (id, amount, source) => {
            const actor = actorOf(id);
            if (actor === undefined || !actor.isAlive() || !(amount > 0)) return false;
            const blow = damageSourceOfScript(source, actorOf);
            // A blow inside the grace period of a stronger one lands without taking health, and
            // BDS still reports it as applied, as the `entity-events` scenario recorded.
            return actor.getWorld().dataEntities().damageEntity(actor, amount, blow, 'command') !== undefined;
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
