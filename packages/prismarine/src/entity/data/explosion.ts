/**
 * The blast a data-driven entity sets off, over the content world seam.
 *
 * `minecraft:explode` is the component a creeper, a TNT minecart and a wither skull all carry,
 * and until now the runtime could only hurt what was near: it had no way to break a block, so a
 * creeper took the fence with it and left the hole for later. This is that hole, filled by the
 * same `@jsprismarine/engine-systems` ray cast `entity/Explosion.ts` runs for the class-based
 * entities, over `ContentBlockAccess` instead of over a `World`.
 *
 * Two seams, one algorithm. Neither holds the algorithm.
 */
import { explode } from '@jsprismarine/engine-systems';
import type { BlockPosition, BlockRef, ExplosionEntity, ExplosionWorld } from '@jsprismarine/engine-systems';
import type { EntityPosition } from '@jsprismarine/entities';

import { rollBlockDrops } from '../../block/blockLoot';
import type { ContentItemDrop, ContentPosition } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import type { DataEntity } from './DataEntity';
import type { EntityWorldFacts } from './host';

/** Air, which is also what an unloaded position reads as. */
const AIR: BlockRef = { name: 'minecraft:air', states: {} };

/**
 * Where an entity's eyes are, as a fraction of its height.
 *
 * Java's `EntityDimensions.eyeHeight` default. It sets the direction of the shove and nothing
 * else, because the damage reads the whole collision box rather than one point.
 */
const EYE_HEIGHT_FRACTION = 0.85;

/**
 * The blast's view of the world.
 *
 * Reads and writes through the content adapter's block group, so a creeper's crater goes through
 * the same path a piston does: the client is told, the light is redone, and a write into a chunk
 * that is not in memory is declined rather than generating terrain.
 */
export const contentExplosionWorld = (world: EntityWorldFacts): ExplosionWorld => ({
    getBlock: (at) => {
        const block = world.blocks.get(at);
        return block === undefined ? AIR : { name: block.identifier, states: block.states };
    },
    setBlock: (at, to, notifyNeighbors) => {
        world.blocks.set(at, { identifier: to.name, states: to.states }, notifyNeighbors);
    },
    randomInt: (bound) => world.random.nextInt(bound),
    randomFloat: () => world.random.nextFloat(),
    getMinY: () => world.level.minY,
    // `ContentLevelFacts.maxY` is one past the highest block; the engine wants the highest.
    getMaxY: () => world.level.maxY - 1
});

/** What to set off. */
export interface ContentBlastOptions {
    /** The center, which for a detonating mob is its own feet. */
    readonly center: EntityPosition;
    /** Java's radius: a creeper is 3, a charged creeper 6, a TNT minecart 4. */
    readonly power: number;
    /** Everything that might be caught. The blast does the range test itself. */
    readonly candidates: readonly DataEntity[];
    /**
     * Whether blocks come out.
     *
     * The caller's answer rather than a game rule read here, because which rule applies is the
     * caller's to know: a creeper's blast answers to `mobGriefing`, a TNT block's does not.
     * {@link import('../../content/world/gameRules')} is where a caller reads one.
     */
    readonly breaksBlocks?: boolean;
    /** The content the loot tables live in. Without it a broken block drops nothing. */
    readonly content?: ServerContent;
    /** Where a broken block's rolled drops go. */
    readonly drop?: (at: ContentPosition, item: ContentItemDrop) => void;
    /**
     * Takes one block out through the server's own destruction path.
     *
     * {@link import('./host').EntityHostFacts.destroyBlock}, which raises the block's
     * `onBreak` before the blast writes air over it - so a chest a creeper caught spills
     * what it held - and rolls the table with the blast radius in it.
     *
     * Absent on a host with no live world, and then {@link ContentBlastOptions.drop} gets
     * the bare roll instead, with the hook unraised.
     *
     * @returns True when the host took the block, which means nothing more is owed for it.
     */
    readonly destroy?: (at: ContentPosition) => boolean;
}

/** What the blast did to one entity. */
export interface ContentBlastHit {
    readonly entity: DataEntity;
    /** Half-hearts, off Java's curve. Never below 1 for an entity in range. */
    readonly damage: number;
    /** The impulse to add to the entity's motion. */
    readonly knockback: EntityPosition;
}

/** What one blast came to. */
export interface ContentBlastResult {
    readonly hits: readonly ContentBlastHit[];
    /** How many blocks were cleared. */
    readonly broken: number;
}

/** An entity as the ray math reads it, with the runtime entity carried through. */
interface Caught extends ExplosionEntity {
    readonly carried: DataEntity;
}

/** The box, the feet and the eyes of one runtime entity. */
const caughtFrom = (entity: DataEntity): Caught => {
    const { width, height } = entity.facts.box;
    const feet = entity.position;

    return {
        carried: entity,
        position: feet,
        eye: { x: feet.x, y: feet.y + height * EYE_HEIGHT_FRACTION, z: feet.z },
        knockbackResistance: entity.facts.knockbackResistance,
        box: {
            minX: feet.x - width / 2,
            minY: feet.y,
            minZ: feet.z - width / 2,
            maxX: feet.x + width / 2,
            maxY: feet.y + height,
            maxZ: feet.z + width / 2
        }
    };
};

/** Rolls one destroyed block's loot, with Java's `1 / radius` explosion chance. */
const dropBlock = (options: ContentBlastOptions, at: BlockPosition, block: BlockRef): void => {
    const { content, drop } = options;
    if (content === undefined || drop === undefined) return;

    for (const rolled of rollBlockDrops(
        content,
        { identifier: block.name, states: block.states },
        { position: at, explosionRadius: options.power }
    )) {
        drop(at, rolled);
    }
};

/**
 * Sets a blast off for a data-driven entity.
 *
 * @returns What to do to each entity caught, which the caller applies because damage and motion
 *   are the runtime's, and how many blocks went.
 * @example
 * ```typescript
 * const blast = detonate(this.world, { center: creeper.position, power: 3, candidates });
 * for (const hit of blast.hits) this.hurt(hit.entity, creeper.id, 'entity_explosion', hit.damage);
 * ```
 */
export const detonate = (world: EntityWorldFacts, options: ContentBlastOptions): ContentBlastResult => {
    const blast = explode<Caught>(contentExplosionWorld(world), {
        center: options.center,
        radius: options.power,
        entities: options.candidates.map(caughtFrom),
        breaksBlocks: options.breaksBlocks ?? true,
        onBlockDestroyed: (at, block) => dropBlock(options, at, block)
    });

    return {
        broken: blast.broken,
        hits: blast.hits.map((hit) => ({
            entity: hit.entity.carried,
            damage: hit.damage,
            knockback: hit.knockback
        }))
    };
};
