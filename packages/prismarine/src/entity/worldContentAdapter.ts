/**
 * The `entities` group of `ServerWorldAdapter`, over the entities a live {@link World} holds.
 *
 * `contentAdapter.ts` beside this file builds the same group over `EntityRuntime`. Every
 * entity a live world holds is a store entity of its dimension, which this group reads through
 * its actor and finds through the world's entity index, because a content query runs inside the
 * tick and the index answers for the cells a query reaches rather than the whole world. `spawn`
 * enters through that runtime; when no runtime owns the identifier, the adapter reports the
 * refusal rather than creating a body that has no data-driven state behind it.
 */
import { Gametype } from '@jsprismarine/minecraft';

import type { BlockEntityData, ContentEntity, ContentEntityAccess, ContentPosition } from '../content/world/adapter';
import type { ContentLookup } from '../content/world/views';
import { itemOfDrop } from '../inventory/persistence';
import { itemFromContent } from '../item/itemFromContent';
import type { World } from '../world/World';
import type { StoreActor } from './data/storeActors';
import { applyBlockEntityRecord } from '../blockentity/contentRecord';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { PLAYER_IDENTIFIER } from './playerOverlay';

/** The live world whose entities this group reads, or undefined when none is loaded. */
export type LiveWorld = () => World | undefined;

/** What {@link worldEntityAccess} is built over. */
export interface WorldEntityAccessOptions {
    /** The live world, read at call time, because the content is built before any world loads. */
    readonly world: LiveWorld;
    /**
     * The built content, read at call time.
     *
     * The entity registry decides which identifiers {@link ContentEntityAccess.spawn} accepts.
     * Without it a typo in a pack would put an invisible body in the world that nothing could
     * explain, which is the failure the whole adapter is written to avoid.
     */
    readonly content: ContentLookup;
    /**
     * Spawns a declared data entity directly into the live runtime.
     *
     * Undefined means no live runtime owns the type. Zero means the runtime owns the type but
     * refused this spawn.
     */
    readonly spawnDataDriven?: (identifier: string, at: ContentPosition, data?: BlockEntityData) => number | undefined;
}

/**
 * One live entity as the content packages read one.
 *
 * The runtime id is a `bigint` here and a `number` there. The counter starts at one and
 * climbs by one per entity, so every id a session produces is exact as a double; a world
 * that somehow passed 2^53 entities would be long out of other resources first.
 */
const contentEntityOf = (entity: StoreActor): ContentEntity => {
    const position = entity.getPosition();

    return {
        id: Number(entity.getRuntimeId()),
        identifier: entity.getType(),
        position: { x: position.getX(), y: entity.getFeetY(), z: position.getZ() },
        tags: entity.getTags()
    };
};

/** Whether an entity's position falls inside one block. */
const standsIn = (entity: StoreActor, at: ContentPosition): boolean => {
    const position = entity.getPosition();
    return (
        Math.floor(position.getX()) === at.x &&
        Math.floor(entity.getFeetY()) === at.y &&
        Math.floor(position.getZ()) === at.z
    );
};

/** How far an entity is from a position, squared, which is enough to sort and to compare. */
const distanceSquared = (entity: StoreActor, from: ContentPosition): number => {
    const position = entity.getPosition();
    const dx = position.getX() - from.x;
    const dy = entity.getFeetY() - from.y;
    const dz = position.getZ() - from.z;
    return dx * dx + dy * dy + dz * dz;
};

/**
 * The store's entities whose feet stand within a horizontal radius of a point, dropped stacks
 * among them, as actors in ascending runtime id order. A caller narrows the answer with its own
 * exact test.
 */
const actorsWithin = (world: World, x: number, z: number, radius: number): StoreActor[] => {
    const index = world.getEntityIndex();
    const { actors } = world.dataEntities();
    const entities = index.storeWithin(x, z, radius);
    const stacks = index.itemsWithin(x, z, radius);
    // Each query answers in id order, so only an answer drawn from both needs sorting.
    const found =
        stacks.length === 0
            ? entities
            : entities.length === 0
              ? stacks
              : [...entities, ...stacks].sort((left, right) => left.id - right.id);
    return found.flatMap((entity) => actors.actorOf(entity.id) ?? []);
};

/**
 * Builds the `entities` group over one live world.
 *
 * @throws {Error} From any member, when no world is loaded. A content package asking about
 *   entities before there is a world to hold them is a wiring mistake.
 */
export const worldEntityAccess = (options: WorldEntityAccessOptions): ContentEntityAccess => {
    const { world, content } = options;

    const live = (): World => {
        const loaded = world();
        if (loaded === undefined) throw new Error('no world is loaded, so its entities cannot be read or changed');
        return loaded;
    };

    return {
        // Read around the block's center, out to its corners and a little more.
        at: (position) =>
            actorsWithin(live(), position.x + 0.5, position.z + 0.5, 1)
                .filter((entity) => standsIn(entity, position))
                .map(contentEntityOf),
        near: (center, radius) =>
            actorsWithin(live(), center.x, center.z, radius)
                .filter((entity) => distanceSquared(entity, center) <= radius * radius)
                .sort((left, right) => distanceSquared(left, center) - distanceSquared(right, center))
                .map(contentEntityOf),
        players: () =>
            live()
                .getViewers()
                // A player whose entity is in no store yet is not there to be found.
                .flatMap((session) => {
                    const actor = session.getActor();
                    return actor === undefined
                        ? []
                        : [
                              {
                                  ...contentEntityOf(actor),
                                  identifier: PLAYER_IDENTIFIER,
                                  creative: session.gamemode === Gametype.CREATIVE,
                                  spectator: session.gamemode === Gametype.SPECTATOR
                              }
                          ];
                }),
        spawn: (identifier, at, data) => {
            const loaded = live();
            const position = { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 };
            const runtimeId = options.spawnDataDriven?.(identifier, position, data);
            if (runtimeId === undefined) {
                loaded
                    .getServer()
                    .getLogger()
                    .debug(`${identifier} has no data runtime to spawn it`, 'entity/worldContentAdapter');
                return 0;
            }

            if (runtimeId !== 0 && data !== undefined) {
                const spawned = loaded.dataEntities().actors.actorOf(runtimeId);
                if (spawned !== undefined) {
                    const tags = spawned.persistentNbt ?? new NBTTagCompound('');
                    applyBlockEntityRecord(tags, data);
                    spawned.persistentNbt = tags;
                }
            }
            return runtimeId;
        },
        remove: (id) => {
            const { actors, runtime } = live().dataEntities();
            if (actors.actorOf(id) !== undefined) runtime.remove(id, 'body removed');
        },
        drop: (at, item) => {
            const loaded = live();
            // The item registry answers by name, and a drop naming something nothing has
            // registered is lost. Said out loud rather than dropped quietly, because "I see
            // no item" otherwise cannot be told from "no drop was made".
            const built = content();
            const registered = itemFromContent(item.identifier, built);
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
            // with every other holder of that item. Everything the drop carries past its name
            // comes with it, so a chest that spills an enchanted pickaxe spills an enchanted
            // pickaxe; the registry's aux value stands in only where the drop states none.
            const stack = itemOfDrop({ meta: registered.getMeta(), ...item }, built);
            if (stack === null) return;

            // Out of the block it names, as a block's own drop leaves it, so it can merge with
            // one from the block beside it.
            void loaded.dropFromBlock(at, [stack]).catch((error: unknown) => {
                loaded.getServer().getLogger().error(error);
            });
        },
        countOfType: (identifier, at, radius) =>
            actorsWithin(live(), at.x, at.z, radius).filter(
                (entity) => entity.getType() === identifier && distanceSquared(entity, at) <= radius * radius
            ).length
    };
};
