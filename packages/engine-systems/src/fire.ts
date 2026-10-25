/**
 * Fire spread and burnout.
 *
 * `FireBlock.tick` and `FireBlock.checkBurnOut` from the 26.3 jar. The ignite
 * and burn odds `FireBlock.bootStrap` installs for 254 blocks are not repeated
 * here: `@jsprismarine/mapping` already holds them per block state, dumped from
 * the same jar, and {@link igniteOddsOf} and {@link burnOddsOf} read them.
 *
 * Fire runs on scheduled ticks in Java, 30 to 40 game ticks apart, and is not
 * affected by `random_tick_speed`. Bedrock drives fire from random ticks
 * instead; this package follows Java.
 */

import { burnOddsOf, hasSturdyTopFace, igniteOddsOf, isAir } from './blockRules';
import type { NeighborUpdates } from './neighborUpdates';
import type { BlockPosition, BlockRef, Dimension, WorldAccess } from './world';
import { AIR, DIRECTIONS, difficultyId, offset, relative } from './world';

/** The fire block. */
export const FIRE = 'minecraft:fire';

/** The age state fire carries, 0 to 15. */
export const FIRE_AGE_STATE = 'age';

/** Fire's maximum age, Java's `FireBlock.MAX_AGE`. */
export const FIRE_MAX_AGE = 15;

/** The lowest interval between two fire ticks, from `FireBlock.getFireTickDelay`. */
export const FIRE_TICK_DELAY_MIN = 30;

/** The spread of the fire tick interval: 30 plus a draw from 10. */
export const FIRE_TICK_DELAY_SPREAD = 10;

/**
 * The block each dimension burns forever on, Java's `DimensionType.infiniburn`.
 *
 * Fire on one of these never ages out and never checks its own fuel, which is
 * what keeps a nether portal frame and the top of the nether alight.
 */
export const INFINITE_FIRE_SOURCES: Readonly<Record<Dimension, ReadonlySet<string>>> = {
    overworld: new Set(['minecraft:netherrack', 'minecraft:magma']),
    nether: new Set(['minecraft:netherrack', 'minecraft:magma']),
    the_end: new Set(['minecraft:netherrack', 'minecraft:magma', 'minecraft:bedrock'])
};

/** `FireBlock.getFireTickDelay`: 30 plus a draw from 10. */
export const fireTickDelay = (world: WorldAccess): number =>
    FIRE_TICK_DELAY_MIN + world.randomInt(FIRE_TICK_DELAY_SPREAD);

/** Whether the block catches fire at all, which is `igniteOdds > 0`. */
export const canBurn = (block: BlockRef): boolean => igniteOddsOf(block) > 0;

/** `FireBlock.isValidFireLocation`: any of the six neighbors is flammable. */
export const isValidFireLocation = (world: WorldAccess, at: BlockPosition): boolean =>
    DIRECTIONS.some((direction) => canBurn(world.getBlock(relative(at, direction))));

/** `FireBlock.getIgniteOdds(level, pos)`: the best odds around an empty position. */
export const igniteOddsAround = (world: WorldAccess, at: BlockPosition): number => {
    if (!isAir(world.getBlock(at))) return 0;
    let odds = 0;
    for (const direction of DIRECTIONS) {
        odds = Math.max(odds, igniteOddsOf(world.getBlock(relative(at, direction))));
    }
    return odds;
};

/** `FireBlock.isNearRain`: the position or any of its four horizontal neighbors. */
export const isNearRain = (world: WorldAccess, at: BlockPosition): boolean =>
    world.isRainingAt(at) ||
    world.isRainingAt(relative(at, 'west')) ||
    world.isRainingAt(relative(at, 'east')) ||
    world.isRainingAt(relative(at, 'north')) ||
    world.isRainingAt(relative(at, 'south'));

const fireWithAge = (age: number): BlockRef => ({ name: FIRE, states: { [FIRE_AGE_STATE]: age } });

const ageOf = (block: BlockRef): number => {
    const value = block.states[FIRE_AGE_STATE];
    return typeof value === 'number' ? value : 0;
};

/**
 * `FireBlock.checkBurnOut`: roll against one neighbor's burn odds, and either
 * replace it with fire or leave a hole.
 *
 * @param chance - The denominator: 300 sideways, 250 up and down, each 50 less
 *   where the environment increases burnout.
 */
export const checkBurnOut = (
    updates: NeighborUpdates,
    world: WorldAccess,
    at: BlockPosition,
    chance: number,
    age: number
): void => {
    const odds = burnOddsOf(world.getBlock(at));
    if (world.randomInt(chance) >= odds) return;

    // A burned block leaves nothing of itself, which is Java's `removeBlock(pos, false)` and
    // what makes burning a house cost the house. It still spills what it was holding, so a
    // chest the fire reached pours its contents out rather than losing them with the block.
    if (world.randomInt(age + 10) < 5 && !world.isRainingAt(at)) {
        const newAge = Math.min(age + Math.floor(world.randomInt(5) / 4), FIRE_MAX_AGE);
        world.destroyBlock(at, { drops: false, replacement: fireWithAge(newAge) });
    } else {
        world.destroyBlock(at, { drops: false });
    }
    updates.updateNeighborsAt(at, FIRE);
};

/**
 * `FireBlock.tick`: age the fire, decide whether it goes out, burn the six
 * blocks it touches, then try to light every position in the 3 by 3 by 6 box
 * around it.
 *
 * The spread odds are Java's: `(igniteOdds + 40 + difficultyId * 7) / (age + 30)`
 * against a denominator of 100, rising by 100 for each block above the first
 * one overhead.
 *
 * @param increasedBurnout - Java's `INCREASED_FIRE_BURNOUT` environment
 *   attribute, which humid biomes set. It takes 50 off every burn-out
 *   denominator and halves the spread odds.
 */
export const fireTick = (
    updates: NeighborUpdates,
    world: WorldAccess,
    at: BlockPosition,
    increasedBurnout = false
): void => {
    const state = world.getBlock(at);
    if (state.name !== FIRE) return;

    world.scheduleTick('block', at, FIRE, fireTickDelay(world));

    const below = world.getBlock(relative(at, 'down'));
    // `FireBlock.canSurvive`: a solid floor, or something flammable to cling to.
    //
    // Fire going out is a plain write rather than a {@link WorldAccess.destroyBlock}, here
    // and in the two places below. Those are for a block that holds or yields something, and
    // fire holds nothing, yields nothing and has no block entity to lose.
    if (!hasSturdyTopFace(below) && !isValidFireLocation(world, at)) {
        world.setBlock(at, AIR, true);
        return;
    }
    const infiniBurn = INFINITE_FIRE_SOURCES[world.getDimension()].has(below.name);
    let age = ageOf(state);

    const raining = world.getWeather() !== 'clear';
    if (!infiniBurn && raining && isNearRain(world, at) && world.randomFloat() < 0.2 + age * 0.03) {
        world.setBlock(at, AIR, true);
        return;
    }

    const newAge = Math.min(FIRE_MAX_AGE, age + Math.floor(world.randomInt(3) / 2));
    if (age !== newAge) {
        age = newAge;
        world.setBlock(at, fireWithAge(age), false);
    }

    if (!infiniBurn) {
        if (!isValidFireLocation(world, at)) {
            // Fire with no fuel survives on a solid floor until it is past age 3.
            if (!hasSturdyTopFace(below) || age > 3) world.setBlock(at, AIR, true);
            return;
        }
        if (age === FIRE_MAX_AGE && world.randomInt(4) === 0 && !canBurn(below)) {
            world.setBlock(at, AIR, true);
            return;
        }
    }

    const extra = increasedBurnout ? -50 : 0;
    checkBurnOut(updates, world, relative(at, 'east'), 300 + extra, age);
    checkBurnOut(updates, world, relative(at, 'west'), 300 + extra, age);
    checkBurnOut(updates, world, relative(at, 'down'), 250 + extra, age);
    checkBurnOut(updates, world, relative(at, 'up'), 250 + extra, age);
    checkBurnOut(updates, world, relative(at, 'north'), 300 + extra, age);
    checkBurnOut(updates, world, relative(at, 'south'), 300 + extra, age);

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 4; dy++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                let rate = 100;
                if (dy > 1) rate += (dy - 1) * 100;

                const testPos = offset(at, dx, dy, dz);
                const igniteOdds = igniteOddsAround(world, testPos);
                if (igniteOdds <= 0) continue;

                let odds = Math.floor((igniteOdds + 40 + difficultyId(world.getDifficulty()) * 7) / (age + 30));
                if (increasedBurnout) odds = Math.floor(odds / 2);
                if (odds <= 0) continue;
                if (world.randomInt(rate) > odds) continue;
                if (raining && isNearRain(world, testPos)) continue;

                const spreadAge = Math.min(FIRE_MAX_AGE, age + Math.floor(world.randomInt(5) / 4));
                world.setBlock(testPos, fireWithAge(spreadAge), true);
                updates.updateNeighborsAt(testPos, FIRE);
            }
        }
    }
};
