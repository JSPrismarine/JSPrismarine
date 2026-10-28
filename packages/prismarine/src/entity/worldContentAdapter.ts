/**
 * The `entities` group of `ServerWorldAdapter`, over the entities a live {@link World} holds.
 *
 * `contentAdapter.ts` beside this file builds the same group over `EntityRuntime`. The live
 * world remains the client-facing body index and save boundary, while the runtime owns every
 * data-driven entity's components and behavior. `spawn` enters through that runtime; when no
 * runtime owns the identifier, the adapter reports the refusal rather than creating a class or
 * generic body that has no data-driven state behind it.
 */
import { Gametype } from '@jsprismarine/minecraft';

import type { BlockEntityData, ContentEntity, ContentEntityAccess, ContentPosition } from '../content/world/adapter';
import type { ContentLookup } from '../content/world/views';
import { itemOfDrop } from '../inventory/persistence';
import { itemFromContent } from '../item/itemFromContent';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import { applyBlockEntityRecord } from '../blockentity/contentRecord';
import { NBTTagCompound } from '@jsprismarine/nbt';

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
        position: { x: position.getX(), y: entity.getFeetY(), z: position.getZ() },
        tags: entity.getTags()
    };
};

/** Whether an entity's position falls inside one block. */
const standsIn = (entity: Entity, at: ContentPosition): boolean => {
    const position = entity.getPosition();
    return (
        Math.floor(position.getX()) === at.x &&
        Math.floor(entity.getFeetY()) === at.y &&
        Math.floor(position.getZ()) === at.z
    );
};

/** How far an entity is from a position, squared, which is enough to sort and to compare. */
const distanceSquared = (entity: Entity, from: ContentPosition): number => {
    const position = entity.getPosition();
    const dx = position.getX() - from.x;
    const dy = entity.getFeetY() - from.y;
    const dz = position.getZ() - from.z;
    return dx * dx + dy * dy + dz * dz;
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
                .map((player) => ({
                    ...contentEntityOf(player),
                    identifier: PLAYER_IDENTIFIER,
                    creative: player.gamemode === Gametype.CREATIVE,
                    spectator: player.gamemode === Gametype.SPECTATOR
                })),
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
                const body = loaded.getEntity(BigInt(runtimeId));
                if (body !== null) {
                    body.persistentNbt ??= new NBTTagCompound('');
                    applyBlockEntityRecord(body.persistentNbt, data);
                }
            }
            return runtimeId;
        },
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
            live()
                .getEntities()
                .filter((entity) => entity.getType() === identifier && distanceSquared(entity, at) <= radius * radius)
                .length
    };
};
