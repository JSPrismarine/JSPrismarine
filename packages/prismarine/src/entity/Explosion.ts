/**
 * A blast, over the server's world and its entities.
 *
 * The algorithm is not here. `@jsprismarine/engine-systems` holds Java's `ServerExplosion`, with
 * the 16 by 16 by 16 ray cast, the exposure grid and the damage curve, because an explosion is
 * one of the engine systems neither edition publishes as data. This translates: it hands that
 * package the world and the entities standing near, applies the hits it gets back, and rolls the
 * loot of each block it is told is going.
 *
 * Written once and given a power rather than being a creeper's method, because everything that
 * explodes explodes the same way and differs only in how hard. TNT is 4, a creeper 3, a charged
 * one 6. The one thing a caller supplies beyond the power is who is answerable for it, so a
 * player killed by a creeper is told it was a creeper.
 * @see https://minecraft.wiki/w/Explosion
 */
import type { BlockPosition, ExplosionEntity, ExplosionWorld } from '@jsprismarine/engine-systems';
import { EXPLOSION_ENTITY_REACH, explode as castBlast } from '@jsprismarine/engine-systems';
import type { Vector3 } from '@jsprismarine/math';
import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';

import type { Block } from '../block/Block';
import type { Item } from '../item/Item';
import { destroyedBlockDrops } from '../world/blockDestroy';
import { createEngineWorld } from '../world/EngineWorld';
import { GameRules } from '../world/GameRuleManager';
import type { World } from '../world/World';
import { DEFAULT_FUSE_TICKS, randomShortFuse } from './fuse';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import type { StoreActor } from './data/storeActors';
import { ENTITY_EYE_HEIGHT_FRACTION } from './data/position';

/** The primed TNT entity in the data-driven runtime. */
const TNT_IDENTIFIER = 'minecraft:tnt';

/** What a blast is. */
export interface ExplosionOptions {
    /** Java's radius: TNT is 4, a creeper 3, a charged creeper 6. */
    power: number;
    /** Whoever set it off, so a death can be reported as their doing. */
    source?: StoreActor | null;
    /** Whether it takes blocks out as well as hurting things. */
    breaksBlocks?: boolean;
}

/** An entity paired with the geometry the ray math reads off it. */
interface CaughtEntity extends ExplosionEntity {
    readonly entity: StoreActor;
}

/**
 * Sets a blast off at a point.
 *
 * @param world - Where.
 * @param at - The center, in world coordinates rather than block coordinates.
 * @param options - How hard, and whose fault.
 * Everything has been hurt and the blocks are gone when this returns.
 * @example
 * ```typescript
 * explode(world, creeper.getPosition(), { power: 3, source: creeper });
 * ```
 */
export const explode = (world: World, at: Vector3, options: ExplosionOptions): void => {
    const { power, source = null, breaksBlocks = true } = options;

    world.sendWorldEvent(at, LevelEvent.PARTICLES_EXPLOSION, 0);
    if (source) world.sendActorSound(source, LevelSoundEvent.EXPLODE);

    const center = { x: at.getX(), y: at.getY(), z: at.getZ() };
    const caught = entitiesNear(world, at, power);
    const drops: Array<{ at: BlockPosition; item: Block | Item }> = [];
    const caughtTnt: BlockPosition[] = [];

    const blast = castBlast<CaughtEntity>(explosionWorldOf(world), {
        center,
        radius: power,
        entities: caught,
        breaksBlocks: breaksBlocks && griefingAllowed(world),
        onBlockDestroyed: (position, block) => {
            if (block.name === TNT_IDENTIFIER) {
                caughtTnt.push(position);
                return;
            }

            collectDrops(world, position, power, drops);
        }
    });

    // After the rays rather than inside them, because each one is a fresh entity in the world
    // and a blast measures the world as it stood when it went off.
    for (const position of caughtTnt) primeTnt(world, position, source);

    // After the rays, so an entity is measured against the world as it still stands and a wall
    // shields what is behind it even though the wall is about to stop existing. Java's order.
    for (const hit of blast.hits) {
        const entity = hit.entity.entity;
        if (!entity.isAlive()) continue;

        const blow = new DamageSource({ cause: DamageCause.Explosion, attacker: source });
        // A store entity takes the blow through the store's damage pipeline; the actor's own
        // `damage` hands it to the same pipeline and decides it before it returns.
        if (world.dataEntities().damageEntity(entity, hit.damage, blow, 'explosion') === undefined)
            void entity.damage(hit.damage, blow).catch((error: unknown) => world.getServer().getLogger().error(error));
        shove(entity, hit.knockback);
    }

    for (const drop of drops) world.dropFromBlock(drop.at, [drop.item]);
};

/**
 * The world the ray cast reads and writes.
 *
 * The engine's own view of this server's chunks, so a blast writes blocks through the same path
 * a fluid or a piston does: light, the client packets and the neighbor updates all follow, and a
 * write into a chunk that is not in memory is declined rather than generating terrain.
 */
const explosionWorldOf = (world: World): ExplosionWorld => createEngineWorld(world);

/**
 * Lights the TNT a blast caught, which is what makes a chain.
 *
 * Java's `TntBlock.wasExploded`. The block is not dropped and not rolled for loot -
 * `TntBlock.dropFromExplosion` returns false - it becomes a data-driven primed entity standing
 * in the middle of where it was, with {@link randomShortFuse}'s 10 to 29 ticks rather than a full
 * fuse. The spread is what makes a pile of TNT ripple outward over a second instead of going
 * off as one blast, and the short fuse is why the ripple is quick.
 *
 * The blast has already written air over the block by the time this runs, so there is nothing
 * to clear first.
 */
const primeTnt = (world: World, at: BlockPosition, source: StoreActor | null): void => {
    const [allowed] = world.getGameRuleManager().getGameRule(GameRules.TNTExplodes) ?? [true];
    if (!allowed) return;

    const runtime = world.dataEntities().runtime;
    if (!runtime.content().entities.registry.has(TNT_IDENTIFIER)) {
        world.getServer().getLogger().debug('The data runtime does not declare minecraft:tnt', 'entity/Explosion');
        return;
    }

    runtime.spawn(
        TNT_IDENTIFIER,
        { x: at.x + 0.5, y: at.y, z: at.z + 0.5 },
        {
            cause: 'primed',
            event: 'from_explosion',
            data: { fuse: randomShortFuse(DEFAULT_FUSE_TICKS, runtime.world.random.nextFloat()) },
            ...(source === null ? {} : { ownerId: Number(source.getRuntimeId()) })
        }
    );
};

/** Whether the world lets explosions rearrange it. */
const griefingAllowed = (world: World): boolean => {
    const [allowed] = world.getGameRuleManager()?.getGameRule(GameRules.MobGriefing) ?? [true];
    return Boolean(allowed);
};

/**
 * Everything that might be caught, with its box, its feet and its eyes.
 *
 * From the world's entity index rather than every entity in the world, so an entity that moved
 * earlier in the tick is caught where it now stands and one taken out of the world is not caught
 * at all. Each is a store entity, as its actor. The engine accepts anything within its reach plus
 * a block and runs the range test itself. In ascending runtime id order, which is the order the
 * index answers in and the hits come back in.
 *
 * The eyes are at Java's `EntityDimensions.eyeHeight` default. A player's own is 1.62 rather than
 * that, which is 0.09 higher than the default puts it; it moves the knockback direction by a
 * fraction of a degree and nothing else, because the damage reads the whole collision box instead.
 */
const entitiesNear = (world: World, at: Vector3, power: number): readonly CaughtEntity[] => {
    const index = world.getEntityIndex();
    const live = world.dataEntities();
    const radius = power * EXPLOSION_ENTITY_REACH + 1;
    const near: StoreActor[] = [];
    for (const entity of index.storeWithin(at.getX(), at.getZ(), radius)) {
        const actor = live.actors.actorOf(entity.id);
        if (actor !== undefined) near.push(actor);
    }

    return near.map((entity) => {
        const position = entity.getPosition();
        const { width, height } = entity.getBox();
        const feet = { x: position.getX(), y: entity.getFeetY(), z: position.getZ() };

        return {
            entity,
            position: feet,
            eye: { x: feet.x, y: feet.y + height * ENTITY_EYE_HEIGHT_FRACTION, z: feet.z },
            box: {
                minX: feet.x - width / 2,
                minY: feet.y,
                minZ: feet.z - width / 2,
                maxX: feet.x + width / 2,
                maxY: feet.y + height,
                maxZ: feet.z + width / 2
            }
        };
    });
};

/**
 * Takes one block out through the content hooks and keeps what it yielded.
 *
 * The same path a player's break goes through, so the block's family gets `onBreak` before
 * the blast writes air over it - which is what spills a chest the TNT caught and unpairs a
 * double chest - and Java's table decides the rest. The blast adds one parameter:
 * `explosion_radius` is what every vanilla table's `minecraft:explosion_decay` function
 * reads, and it keeps each item of a rolled stack with a chance of `1 / radius`. So a stone
 * wall taken out by a radius-4 TNT blast yields cobblestone one time in four, which is the
 * loss players see.
 *
 * The drops are kept and put on the ground once the blows have landed, so the ray cast writes
 * nothing but blocks.
 */
const collectDrops = (
    world: World,
    at: BlockPosition,
    radius: number,
    into: Array<{ at: BlockPosition; item: Block | Item }>
): void => {
    for (const drop of destroyedBlockDrops({ world, position: at, explosionRadius: radius })) {
        into.push({ at, item: drop });
    }
};

/**
 * Throws an entity away from the blast.
 *
 * Java adds the whole impulse to the entity's motion. This server's knockback takes a
 * horizontal direction and a strength and works out its own lift, so the horizontal part
 * carries over exactly and the vertical part is the server's rather than Java's.
 */
const shove = (entity: StoreActor, knockback: { x: number; y: number; z: number }): void => {
    const flat = Math.hypot(knockback.x, knockback.z);
    if (flat < Number.EPSILON) return;

    entity.applyKnockback(knockback.x / flat, knockback.z / flat, flat);
};
