/**
 * The maps a player carries, ticked as Java 26.3 ticks them: `MapItem.inventoryTick` for every
 * map in the player's inventory, then `ServerPlayer.synchronizeSpecialItemUpdates`.
 *
 * Every map carried moves its holders' markers. A map held in either hand that is not locked
 * fills in around the player when it shows the dimension the player is in. Each map then sends
 * the player the pixels and markers it has not been sent yet.
 */
import ClientboundMapItemDataPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundMapItemDataPacket';

import type { Item } from '../item/Item';
import type { MapCarrier } from '../world/mapCarriers';
import { carriersOf } from '../world/mapCarriers';
import { updateMapAround } from '../world/mapRender';
import { mapTerrainOf } from '../world/mapTerrain';
import type { SavedMap } from '../world/savedMap';
import { drawnColors } from '../world/savedMap';
import { mapItemDataOf } from '../editions/bedrock/mapItemData';
import type PlayerSession from './PlayerSession';

/** The containers Java's `Inventory` holds: the slots, the armor and the off hand, not the ender chest. */
const CARRIED_CONTAINERS: ReadonlySet<string> = new Set(['inventory', 'armor', 'offhand']);

/** The tag of the equipment that keeps its wearer off maps, such as a carved pumpkin. */
const MAP_INVISIBILITY_EQUIPMENT = 'minecraft:map_invisibility_equipment';

/** Every stack a player carries, as Java's `Inventory` iterates them. */
const carriedStacks = (session: PlayerSession): Item[] =>
    session
        .getPlayer()
        .getInventory()
        .entries()
        .flatMap(([name, container]) => (CARRIED_CONTAINERS.has(name) ? container.stacks() : []));

const carriers = new WeakMap<PlayerSession, MapCarrier>();

/** The session as a map sees it, the same object every tick so a map knows it as one holder. */
export const mapCarrierOf = (session: PlayerSession): MapCarrier => {
    let carrier = carriers.get(session);
    if (carrier !== undefined) return carrier;

    carrier = {
        name: session.identity.name,
        isRemoved: () => !session.isConnected(),
        // A session that left has forgotten its player, so it carries nothing and wears nothing.
        carries: (map: SavedMap) => {
            if (!session.isConnected()) return false;
            const level = session.getWorld().getLevel();
            return carriedStacks(session).some((stack) => {
                const id = stack.getMapId();
                return id !== undefined && level.getMap(id) === map;
            });
        },
        dimension: () => session.getWorld().getDimension().id,
        position: () => {
            const player = session.getPlayer();
            const position = player.getPosition();
            return {
                x: position.getX(),
                z: position.getZ(),
                yaw: player.yaw,
                gameTime: session.getWorld().getLevel().getTicks()
            };
        },
        hidesFromMaps: () => {
            if (!session.isConnected()) return false;
            const tags = session.getServer().getContent().tags;
            if (!tags.has('item', MAP_INVISIBILITY_EQUIPMENT)) return false;
            const hiding = new Set(tags.members('item', MAP_INVISIBILITY_EQUIPMENT));
            const armor = session.getPlayer().getInventory().container('armor').stacks();
            return armor.some((stack) => hiding.has(stack.getName()));
        }
    };
    carriers.set(session, carrier);
    return carrier;
};

/**
 * Ticks every map a player carries and sends what changed.
 *
 * @returns The sends, which the caller does not wait for.
 */
export const tickCarriedMaps = (session: PlayerSession): Promise<void>[] => {
    const stacks = carriedStacks(session);
    const ids = new Set(stacks.flatMap((stack) => stack.getMapId() ?? []));
    if (ids.size === 0) return [];

    const world = session.getWorld();
    const level = world.getLevel();
    const inventory = session.getPlayer().getInventory();
    const held = new Set(
        [inventory.equipment('mainhand'), inventory.equipment('offhand')].flatMap((stack) => stack?.getMapId() ?? [])
    );
    const carrier = mapCarrierOf(session);
    const sends: Promise<void>[] = [];

    for (const id of ids) {
        const map = level.getMap(id);
        if (map === undefined) continue;
        const mapCarriers = carriersOf(map);
        mapCarriers.tickCarriedBy(carrier);

        // An explorer map's preview, and the number a client knows its dimension by, need its world.
        const mapWorld = level.loadedWorld(map.dimension);
        if (mapWorld === undefined) continue;
        drawnColors(map, (x, z) => mapWorld.isMapWaterAt(x, z));

        if (!map.locked && held.has(id) && mapWorld === world) {
            const position = session.getPlayer().getPosition();
            const step = mapCarriers.nextStep(carrier);
            updateMapAround(
                map,
                { x: position.getX(), z: position.getZ(), step },
                mapTerrainOf(world),
                mapCarriers.paint
            );
        }

        const update = mapCarriers.nextUpdate(carrier);
        if (update === undefined) continue;
        const data = mapItemDataOf(id, map, mapWorld.getDimension().bedrockId, update);
        sends.push(
            session.send(new ClientboundMapItemDataPacket(data)).catch((error: unknown) => {
                mapCarriers.unsent(carrier, update);
                throw error;
            })
        );
    }
    return sends;
};
