/**
 * The `entities` group of `ServerWorldAdapter`, over the entities a live {@link World} holds.
 *
 * `contentAdapter.ts` beside this file builds the same group over `EntityRuntime`, which is
 * the data-driven entity system and is not what a running server has yet. A running server
 * has the class-based entities, and six of the seven members read or write those perfectly
 * well: they are queries over a list and a drop onto the ground.
 *
 * The seventh, `spawn`, puts a body into the live world rather than an `EntityInstance` into the
 * data-driven index, because the live world is what clients are sent and what a save writes.
 * Which identifiers may be spawned comes from the content registry, so a pack's own mob is
 * spawnable; what gets built is a class when one of the written classes adds behavior that
 * identifier needs, and a {@link GenericEntity} carrying the identifier otherwise. The client
 * draws a Bedrock entity from its identifier, so the generic body is the right thing rather than
 * a stand-in. An identifier no registry carries is reported and nothing is spawned.
 */
import { Vector3 } from '@jsprismarine/math';

import type { BlockEntityData, ContentEntity, ContentEntityAccess, ContentPosition } from '../content/world/adapter';
import type { ContentLookup } from '../content/world/views';
import { Item } from '../item/Item';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { spawnableEntities } from './Entities';
import type { Entity, SpawnableEntityClass } from './Entity';
import { GenericEntity } from './GenericEntity';
import FallingBlock from './other/FallingBlock';
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
}

/** The spawnable classes by the identifier each one carries, built once. */
let classIndex: Map<string, SpawnableEntityClass> | null = null;

/** The class for an identifier, or undefined when no written class covers it. */
const classFor = (identifier: string): SpawnableEntityClass | undefined => {
    classIndex ??= new Map(spawnableEntities().map((candidate) => [candidate.MOB_ID, candidate]));
    return classIndex.get(identifier);
};

/**
 * The block a falling block is made of, which its own data carries under `block`.
 *
 * The one entity whose class cannot be built from a position alone. A spawn that names no block
 * is refused rather than given a default: a falling nothing lands as a wrong block.
 */
const fallingBlockName = (data: BlockEntityData | undefined): string | undefined =>
    typeof data?.['block'] === 'string' ? data['block'] : undefined;

/**
 * Builds the body for one identifier, or reports why it could not.
 *
 * @returns The entity, or a string saying what stopped it, which the caller logs.
 */
const bodyFor = (
    identifier: string,
    position: Position,
    data: BlockEntityData | undefined,
    content: ContentLookup
): Entity | string => {
    if (identifier === FallingBlock.MOB_ID) {
        const blockName = fallingBlockName(data);
        if (blockName === undefined) return 'a falling block was spawned without the block it is made of';
        return new FallingBlock({ position, blockName });
    }

    const written = classFor(identifier);
    if (written !== undefined) return new written({ position });

    if (!content().entities.registry.has(identifier)) {
        return `${identifier} is not an entity any loaded pack declares`;
    }

    return new GenericEntity({ identifier, position });
};

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
                .map((player) => ({ ...contentEntityOf(player), identifier: PLAYER_IDENTIFIER })),
        spawn: (identifier, at, data) => {
            const loaded = live();
            // The middle of the block, which is where Bedrock puts a mob it spawns and what
            // keeps a lit TNT block's entity standing where the block stood.
            const position = Position.fromVector3(new Vector3(at.x + 0.5, at.y + 0.5, at.z + 0.5), loaded);

            const body = bodyFor(identifier, position, data, content);
            if (typeof body === 'string') {
                loaded.getServer().getLogger().debug(body, 'entity/worldContentAdapter');
                // No id, because nothing was spawned. `remove` ignores an id it does not hold,
                // so a behavior that keeps the number cannot remove somebody else's entity.
                return 0;
            }

            // Everything the record carries that the body does not model - a TNT's fuse, a
            // bucketed fish's variant - goes where the serializer already writes it back from.
            if (data !== undefined) {
                body.persistentNbt ??= new NBTTagCompound('');
                applyBlockEntityRecord(body.persistentNbt, data);
            }

            void loaded.addEntity(body).catch((error: unknown) => {
                loaded.getServer().getLogger().error(error);
            });

            return Number(body.getRuntimeId());
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
