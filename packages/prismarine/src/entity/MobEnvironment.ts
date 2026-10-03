import { DamageCause } from './DamageCause';
import {
    BREATH_TICKS,
    BURN_TICKS,
    DROWNING_DAMAGE,
    DROWNING_INTERVAL,
    HAZARD_DAMAGE,
    HAZARD_INTERVAL,
    isAllowed,
    SUFFOCATION_DAMAGE,
    SUFFOCATION_INTERVAL,
    VOID_DAMAGE,
    VOID_DEPTH,
    VOID_INTERVAL
} from './Environment';
import { isDay } from '../world/DayCycle';
import type { Mob } from './Mob';
import { statsOf } from './MobStats';

/**
 * Everything the world does to a mob that is not another mob doing it.
 *
 * A separate module rather than more methods on `Mob`, which is already long and is about
 * *movement* - this is a different concern that happens to need the same block reader. It is a
 * function over a mob rather than a mixin because there is only one caller and nothing to
 * configure.
 *
 * All of it goes through `BlockView`, the same synchronous reader the pathfinder uses: an
 * environmental check runs for every mob every tick, and awaiting a chunk load per mob per tick
 * would cost more than the mobs do.
 */

/** Where the bookkeeping lives between ticks. Owned by the mob; read and written only here. */
export interface EnvironmentState {
    /** Ticks left of burning, whether or not the mob is still standing in the fire. */
    burning: number;
    /** Ticks spent underwater, up to the point the mob starts drowning. */
    submerged: number;
    /** Counts up to each interval, so the intervals do not all fire on the same tick. */
    clock: number;
}

/** A mob that has never been anywhere harmful. */
export const freshEnvironment = (): EnvironmentState => ({ burning: 0, submerged: 0, clock: 0 });

/**
 * Hurts a mob for wherever it is standing.
 *
 * Called once a tick from `Mob.update`, after the physics, so it judges where the mob *ended up*
 * rather than where it set off from - a mob that walked into lava this tick burns this tick.
 * @param {Mob} mob - Who to check.
 * @param {EnvironmentState} state - Its bookkeeping, mutated in place.
 * @returns {Promise<void>} Resolves once any damage has been applied.
 */
export const tickEnvironment = async (mob: Mob, state: EnvironmentState): Promise<void> => {
    if (!mob.isAlive()) return;

    state.clock++;

    const view = mob.getBlockView();
    const position = mob.getPosition();

    const x = Math.floor(position.getX());
    const z = Math.floor(position.getZ());
    const feet = Math.floor(mob.getFeetY());

    // Below the world entirely. Checked first: nothing else matters down there, and there are no
    // blocks to read. The floor comes from the chunk rather than from the dimension so that
    // everything a mob knows about where it is arrives through the one reader.
    const floor = view.floorAt(x, z);
    if (floor !== null && mob.getFeetY() < floor - VOID_DEPTH) {
        if (state.clock % VOID_INTERVAL === 0) await mob.damage(VOID_DAMAGE, DamageCause.Void);
        return;
    }

    // Standing in something that hurts, or standing in the morning sun. The two share a timer, so
    // a zombie that walks out of a fire into daylight goes on burning rather than starting again.
    const standingIn = view.harmAt(x, feet, z) ?? view.harmAt(x, feet + 1, z);
    if (!standingIn && caughtByDaylight(mob, state, x, feet, z)) state.burning = BURN_TICKS;

    await burn(mob, state, standingIn);
    await suffocate(mob, state, view.isSolid(x, feet + 1, z));
    await drown(mob, state, view.isSubmerged(x, feet + 1, z));
};

/**
 * Whether the sun has caught an undead out in the open.
 *
 * Checked on the hazard interval rather than every tick, because seeing whether anything stands
 * between a mob and the sky means walking the column above it - cheap once, and not cheap for
 * every zombie on the server twenty times a second. It only runs for the species that can burn at
 * all, so nothing pays for it that would not catch fire anyway.
 *
 * Water saves you, which is why a drowned is safe in its river and alight the moment it climbs
 * out. A helmet would too, in vanilla; there are no armour slots yet, so that is not modelled.
 * @param {Mob} mob - Who might be burning.
 * @param {EnvironmentState} state - Its bookkeeping, for the interval clock.
 * @param {number} x - Where it is standing.
 * @param {number} feet - The block its feet are in.
 * @param {number} z - Where it is standing.
 * @returns {boolean} `true` if it should catch light.
 */
const caughtByDaylight = (mob: Mob, state: EnvironmentState, x: number, feet: number, z: number): boolean => {
    if (!statsOf(mob.getType()).burnsInDaylight) return false;
    if (state.clock % HAZARD_INTERVAL !== 0) return false;

    const world = mob.getWorld();
    if (!isDay(world.getTicks())) return false;
    if (!isAllowed(world, DamageCause.Fire)) return false;

    const view = mob.getBlockView();

    // Head first: a zombie in a one-deep pool has its feet under water and its skull in the sun.
    if (view.isSubmerged(x, feet + 1, z)) return false;

    return view.seesSky(x, feet + 1, z);
};

/**
 * Standing in something harmful, and still being on fire after having left it.
 *
 * The burn outlasts the fire by eight seconds, which is what makes walking *through* a fire worse
 * than walking past one and what makes water worth running to. Lava sets the same timer, so a mob
 * that climbs out of it keeps burning.
 */
const burn = async (mob: Mob, state: EnvironmentState, standingIn: DamageCause | null): Promise<void> => {
    if (standingIn === DamageCause.Fire || standingIn === DamageCause.Lava) state.burning = BURN_TICKS;

    // Contact hazards do not set anything alight - a cactus pricks and that is all.
    if (standingIn && state.clock % HAZARD_INTERVAL === 0) {
        const damage = HAZARD_DAMAGE[standingIn] ?? 1;
        if (isAllowed(mob.getWorld(), standingIn)) await mob.damage(damage, standingIn);
    }

    if (state.burning > 0) {
        state.burning--;
        mob.metadata.setOnFire(state.burning > 0);

        // Only when it is no longer standing in the thing that lit it, or the fire would be
        // charged twice for the same tick.
        if (!standingIn && state.clock % HAZARD_INTERVAL === 0 && isAllowed(mob.getWorld(), DamageCause.Fire)) {
            await mob.damage(HAZARD_DAMAGE[DamageCause.Fire] ?? 1, DamageCause.Fire);
        }
    }
};

/** A solid block where the mob's head is. */
const suffocate = async (mob: Mob, state: EnvironmentState, buried: boolean): Promise<void> => {
    if (!buried || state.clock % SUFFOCATION_INTERVAL !== 0) return;

    await mob.damage(SUFFOCATION_DAMAGE, DamageCause.Suffocation);
};

/**
 * Running out of air.
 *
 * A mob has no air bar for anybody to look at, so unlike a player's this is only a counter and the
 * moment it runs out. Anything that lives in water is exempt - see `MobStats.aquatic`, which says
 * so outright rather than inferring it from a swim speed.
 */
const drown = async (mob: Mob, state: EnvironmentState, underwater: boolean): Promise<void> => {
    if (!underwater || breathesWater(mob)) {
        state.submerged = 0;
        return;
    }

    state.submerged++;
    if (state.submerged < BREATH_TICKS) return;

    if (state.clock % DROWNING_INTERVAL === 0 && isAllowed(mob.getWorld(), DamageCause.Drowning)) {
        await mob.damage(DROWNING_DAMAGE, DamageCause.Drowning);
    }
};

/** Whether this is something that lives in water, from `MobStats`. */
const breathesWater = (mob: Mob): boolean => statsOf(mob.getType()).aquatic;
