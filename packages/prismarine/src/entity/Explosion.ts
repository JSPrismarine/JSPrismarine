import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import type { Vector3 } from '@jsprismarine/math';
import { GameRules } from '../world/GameRuleManager';
import type { World } from '../world/World';
import type BlockView from './ai/BlockView';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { sizeOf } from './EntitySize';

/**
 * A blast: what it hurts, how hard, and what it takes out of the world.
 *
 * Written once and given a power rather than being a creeper's method, because everything that
 * explodes explodes the same way and differs only in how hard - TNT is 4, a creeper 3, a charged
 * one 6. The one thing a caller supplies beyond the power is who is answerable for it, so a
 * player killed by a creeper is told it was a creeper.
 * @see https://minecraft.wiki/w/Explosion
 */

/** How far past its own power a blast reaches, and the divisor the damage curve is built on. */
const REACH_MULTIPLIER = 2;

/**
 * The curve, straight from vanilla.
 *
 * `((impact² + impact) / 2) * 7 * diameter + 1`, where impact runs from one at the centre to zero
 * at the edge. It is steep on purpose: a creeper at point blank does forty-three half-hearts and
 * kills an unarmoured player outright, and one at four blocks does a couple.
 */
const DAMAGE_CURVE = 7;

/** How hard a blast shoves, at the centre. */
const KNOCKBACK = 1.6;

/** How far apart the samples are when checking whether something is behind cover. */
const SIGHT_STEP = 0.5;

/**
 * Blocks a blast does not remove.
 *
 * By name against the block state rather than through the block registry, for the reason
 * `world/physics/BlockRules` sets out: the registry knows a fifth of the blocks the client does
 * and `getBlock` returns *air* for the rest, so a blast-resistance check through it would quietly
 * decide that most of the world was air and blow up the lot.
 */
const BLAST_PROOF: ReadonlySet<string> = new Set([
    'minecraft:bedrock',
    'minecraft:obsidian',
    'minecraft:crying_obsidian',
    'minecraft:ancient_debris',
    'minecraft:netherite_block',
    'minecraft:reinforced_deepslate',
    'minecraft:enchanting_table',
    'minecraft:ender_chest',
    'minecraft:respawn_anchor',
    'minecraft:end_portal_frame',
    'minecraft:end_portal',
    'minecraft:end_gateway',
    'minecraft:barrier',
    'minecraft:command_block',
    'minecraft:chain_command_block',
    'minecraft:repeating_command_block',
    'minecraft:structure_block',
    'minecraft:jigsaw',
    // Liquids absorb a blast rather than being thrown by it, which is why a moat works.
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava'
]);

/** What a blast is. */
export interface ExplosionOptions {
    /** Vanilla's power: TNT is 4, a creeper 3, a charged creeper 6. */
    power: number;
    /** Whoever set it off, so a death can be reported as their doing. */
    source?: Entity | null;
    /** Whether it takes blocks out as well as hurting things. */
    breaksBlocks?: boolean;
}

/**
 * Sets a blast off at a point.
 * @param {World} world - Where.
 * @param {Vector3} at - The centre.
 * @param {ExplosionOptions} options - How hard, and whose fault.
 * @returns {Promise<void>} Resolves once everything has been hurt and the blocks are gone.
 * @example
 * ```typescript
 * await explode(world, creeper.getPosition(), { power: 3, source: creeper });
 * ```
 */
export const explode = async (world: World, at: Vector3, options: ExplosionOptions): Promise<void> => {
    const { power, source = null, breaksBlocks = true } = options;
    const reach = power * REACH_MULTIPLIER;

    await world.sendWorldEvent(at, LevelEvent.PARTICLES_EXPLOSION, 0);
    if (source) await world.sendActorSound(source, LevelSoundEvent.EXPLODE);

    if (breaksBlocks && griefingAllowed(world)) await breakBlocks(world, at, power);

    // After the blocks, so anything thrown by the blast is thrown through the hole it made rather
    // than into the wall that is about to stop existing.
    await hurtEverythingNear(world, at, reach, source);
};

/** Whether the world lets explosions rearrange it. */
const griefingAllowed = (world: World): boolean => {
    const [allowed] = world.getGameRuleManager().getGameRule(GameRules.MobGriefing) ?? [true];
    return Boolean(allowed);
};

/**
 * Hurts and shoves everything within reach, less the further out it is.
 *
 * The grid rather than every entity in the world: it is rebuilt once a tick and covers the three
 * by three chunks around a point, which is wider than any blast this server can produce.
 */
const hurtEverythingNear = async (world: World, at: Vector3, reach: number, source: Entity | null): Promise<void> => {
    const caught = world.getEntityGrid().near(at.getX(), at.getZ());

    await Promise.all(
        caught.map(async (entity) => {
            if (!entity.isAlive()) return;

            const distance = distanceFrom(at, entity);
            if (distance >= reach) return;

            const impact = (1 - distance / reach) * exposure(at, entity);
            if (impact <= 0) return;

            const damage = Math.floor(((impact * impact + impact) / 2) * DAMAGE_CURVE * reach + 1);

            await entity.damage(damage, new DamageSource({ cause: DamageCause.Explosion, attacker: source }));

            shove(at, entity, impact);
        })
    );
};

/** Distance from the blast to the middle of an entity's body, rather than to its feet. */
const distanceFrom = (at: Vector3, entity: Entity): number => {
    const position = entity.getPosition();
    const middle = entity.getFeetY() + sizeOf(entity.getType()).height / 2;

    return Math.hypot(position.getX() - at.getX(), middle - at.getY(), position.getZ() - at.getZ());
};

/**
 * How much of the blast reaches something, between nothing and all of it.
 *
 * Vanilla samples a grid of rays through the entity's box and takes the fraction that get through.
 * This walks one ray to its middle and answers all-or-nothing, which is cheaper and gets the case
 * that matters right: a wall between you and a creeper protects you, and open ground does not.
 * The cost is that a corner is either full cover or none, where vanilla would grade it.
 *
 * Read through the entity's *own* `BlockView` rather than the world's, which is why anything
 * without one - a dropped item, an arrow - is simply counted as exposed. Nothing that lacks a view
 * has cover worth modelling.
 */
const exposure = (at: Vector3, entity: Entity): number => {
    const view = (entity as unknown as { getBlockView?: () => BlockView }).getBlockView?.();
    if (!view) return 1;

    const position = entity.getPosition();
    const middle = entity.getFeetY() + sizeOf(entity.getType()).height / 2;

    const dx = position.getX() - at.getX();
    const dy = middle - at.getY();
    const dz = position.getZ() - at.getZ();
    const length = Math.hypot(dx, dy, dz);
    if (length < SIGHT_STEP) return 1;

    for (let travelled = SIGHT_STEP; travelled < length; travelled += SIGHT_STEP) {
        const t = travelled / length;
        const x = Math.floor(at.getX() + dx * t);
        const y = Math.floor(at.getY() + dy * t);
        const z = Math.floor(at.getZ() + dz * t);

        // `isSolid` answers "yes" for anything not in memory, which is the right conservative
        // answer for a pathfinder - a mob should not walk into the unknown - and exactly the wrong
        // one here: it would make a blast at the edge of the loaded world silently harmless. An
        // unloaded cell is "no idea", not "a wall".
        if (view.isLoaded(x, z) && view.isSolid(x, y, z)) return 0;
    }

    return 1;
};

/** Throws an entity away from the blast, harder the closer it was. */
const shove = (at: Vector3, entity: Entity, impact: number): void => {
    const position = entity.getPosition();
    const dx = position.getX() - at.getX();
    const dz = position.getZ() - at.getZ();
    const flat = Math.hypot(dx, dz);

    if (flat < Number.EPSILON) return;

    entity.applyKnockback(dx / flat, dz / flat, impact * KNOCKBACK);
};

/**
 * Takes out everything soft within the blast's own power, as a sphere.
 *
 * A sphere rather than vanilla's rays, which is the visible simplification here: vanilla fires
 * rays out from the centre and lets each one spend itself against what it passes through, so a
 * blast is stopped by a wall and leaves the room behind it intact. This does not, so a creeper
 * against a one-block wall takes out a little more than it should.
 */
const breakBlocks = async (world: World, at: Vector3, power: number): Promise<void> => {
    const radius = Math.floor(power);
    const centreX = Math.floor(at.getX());
    const centreY = Math.floor(at.getY());
    const centreZ = Math.floor(at.getZ());

    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                if (Math.hypot(x, y, z) > radius) continue;

                const bx = centreX + x;
                const by = centreY + y;
                const bz = centreZ + z;

                const state = await world.getBlockState(bx, by, bz);
                if (state.name === 'minecraft:air' || BLAST_PROOF.has(state.name)) continue;

                // Delay zero: a blast is instantaneous, and letting the block updates queue would
                // spread one explosion across several ticks of visible collapse.
                await world.setBlockByName(bx, by, bz, 'minecraft:air', undefined, 0);
            }
        }
    }
};
