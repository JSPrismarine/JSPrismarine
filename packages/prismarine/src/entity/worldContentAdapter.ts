/**
 * The `entities` group of `ServerWorldAdapter`, over the entities a live {@link World} holds.
 *
 * `contentAdapter.ts` beside this file builds the same group over `EntityRuntime`, which is
 * the data-driven entity system and is not what a running server has yet. A running server
 * has the class-based entities, and six of the seven members read or write those perfectly
 * well: they are queries over a list and a drop onto the ground.
 *
 * The seventh, `spawn`, is left throwing. Putting a new entity into the world by its
 * namespaced identifier needs a factory that covers every identifier a content pack can name,
 * and the class registry covers the handful of types this server has written classes for.
 * Spawning the wrong thing, or nothing at all, for the rest is worse than saying so.
 */
import { Vector3 } from '@jsprismarine/math';

import { CONTENT_AREAS, notWired } from '../content/world/notWired';
import type { ContentEntity, ContentEntityAccess, ContentPosition } from '../content/world/adapter';
import { Item } from '../item/Item';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type { Entity } from './Entity';

/** The live world whose entities this group reads, or undefined when none is loaded. */
export type LiveWorld = () => World | undefined;

/**
 * What the content packages identify a player as.
 *
 * A player has no `MOB_ID`, because nothing ever spawns one from a type, so the identifier
 * the client and every entity file use is named here.
 */
const PLAYER_IDENTIFIER = 'minecraft:player';

/**
 * One live entity as the content packages read one.
 *
 * The runtime id is a `bigint` here and a `number` there. The counter starts at one and
 * climbs by one per entity, so every id a session produces is exact as a double; a world
 * that somehow passed 2^53 entities would be long out of other resources first.
 */
const contentEntityOf = (entity: Entity): ContentEntity => {
    const position = entity.getPosition();

    return {
        id: Number(entity.getRuntimeId()),
        identifier: entity.getType(),
        position: { x: position.getX(), y: position.getY(), z: position.getZ() }
    };
};

/** Whether an entity's position falls inside one block. */
const standsIn = (entity: Entity, at: ContentPosition): boolean => {
    const position = entity.getPosition();
    return (
        Math.floor(position.getX()) === at.x &&
        Math.floor(position.getY()) === at.y &&
        Math.floor(position.getZ()) === at.z
    );
};

/** How far an entity is from a position, squared, which is enough to sort and to compare. */
const distanceSquared = (entity: Entity, from: ContentPosition): number => {
    const position = entity.getPosition();
    const dx = position.getX() - from.x;
    const dy = position.getY() - from.y;
    const dz = position.getZ() - from.z;
    return dx * dx + dy * dy + dz * dz;
};

/**
 * Builds the `entities` group over one live world.
 *
 * @param world - The live world, read at call time, because the content is built before any
 *   world loads.
 */
export const worldEntityAccess = (world: LiveWorld): ContentEntityAccess => {
    const live = (): World => {
        const loaded = world();
        if (loaded === undefined) throw new Error('no world is loaded, so its entities cannot be read or changed');
        return loaded;
    };

    return {
        at: (position) =>
            live()
                .getEntities()
                .filter((entity) => standsIn(entity, position))
                .map(contentEntityOf),
        near: (center, radius) =>
            live()
                .getEntities()
                .filter((entity) => distanceSquared(entity, center) <= radius * radius)
                .sort((left, right) => distanceSquared(left, center) - distanceSquared(right, center))
                .map(contentEntityOf),
        players: () =>
            live()
                .getPlayers()
                .map((player) => ({ ...contentEntityOf(player), identifier: PLAYER_IDENTIFIER })),
        spawn: notWired('entities.spawn', CONTENT_AREAS.entities),
        remove: (id) => {
            const loaded = live();
            const entity = loaded.getEntity(BigInt(id));
            if (entity === null) return;

            void loaded.removeEntity(entity).catch((error: unknown) => {
                loaded.getServer().getLogger().error(error);
            });
        },
        drop: (at, item) => {
            const loaded = live();
            // The item registry answers by name, and a drop naming something nothing has
            // registered is lost. Said out loud rather than dropped quietly, because "I see
            // no item" otherwise cannot be told from "no drop was made".
            const registered = loaded.getServer().getItemManager().getItem(item.identifier);
            if (registered === null) {
                loaded
                    .getServer()
                    .getLogger()
                    .debug(
                        `${item.identifier} is not an item this server has, so it was not dropped`,
                        'entity/worldContentAdapter'
                    );
                return;
            }

            // A fresh stack rather than the registry's own, whose count the registry shares
            // with every other holder of that item.
            const stack = new Item({
                id: registered.getId(),
                name: registered.getName(),
                meta: registered.getMeta(),
                count: item.count
            });

            const position = Position.fromVector3(new Vector3(at.x + 0.5, at.y + 0.5, at.z + 0.5), loaded);
            void loaded.dropContents(position, [stack]).catch((error: unknown) => {
                loaded.getServer().getLogger().error(error);
            });
        },
        countOfType: (identifier, at, radius) =>
            live()
                .getEntities()
                .filter((entity) => entity.getType() === identifier && distanceSquared(entity, at) <= radius * radius)
                .length
    };
};
