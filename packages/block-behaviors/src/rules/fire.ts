/**
 * Scheduled fire spread and burnout, using block components for flammability.
 *
 * The vanilla overlay writes Java's fire odds as `minecraft:flammable`, and a later behavior
 * pack can replace those values on any block state. Infinite fuel comes from Java's
 * `infiniburn_*` block tags.
 */
import type { BlockPosition, HookBlock } from '@jsprismarine/blocks';
import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import { HORIZONTAL_FACES, offset } from '../geometry';
import { AIR, isAir } from '../identifiers';
import type { BlockFlammability, WorldActions } from '../world';

/** The fire block. */
export const FIRE = 'minecraft:fire';

/** The state fire carries, 0 to 15. */
export const FIRE_AGE_STATE = 'age';

/** Java's maximum fire age. */
export const FIRE_MAX_AGE = 15;

/** The first possible tick delay, in game ticks. */
export const FIRE_TICK_DELAY_MIN = 30;

/** Fire adds a draw from this range to {@link FIRE_TICK_DELAY_MIN}. */
export const FIRE_TICK_DELAY_SPREAD = 10;

/** The Java block tag that supplies infinite fire fuel in each vanilla dimension. */
const INFINIBURN_TAGS: Readonly<Record<string, string>> = {
    'minecraft:overworld': 'minecraft:infiniburn_overworld',
    'minecraft:nether': 'minecraft:infiniburn_nether',
    'minecraft:the_end': 'minecraft:infiniburn_end'
};
const DEFAULT_INFINIBURN_TAG = INFINIBURN_TAGS['minecraft:overworld']!;
const FIRE_DIRECTIONS = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** Full cubes that pass light through and therefore need an explicit sturdy-face exception. */
const TRANSPARENT_FULL_CUBES: ReadonlySet<string> = new Set([
    'minecraft:barrier',
    'minecraft:beacon',
    'minecraft:frosted_ice',
    'minecraft:glass',
    'minecraft:hardened_glass',
    'minecraft:honey_block',
    'minecraft:ice',
    'minecraft:powder_snow',
    'minecraft:slime',
    'minecraft:undyed_shulker_box'
]);

/** A block state with the fire age written as Java's tick code does. */
const fireWithAge = (age: number): Readonly<Record<string, number>> => ({ [FIRE_AGE_STATE]: age });

/** The block's age, defaulting to zero when a host omits it. */
const ageOf = (block: HookBlock): number => {
    const age = block.states[FIRE_AGE_STATE];
    return typeof age === 'number' ? age : 0;
};

/** Draw an integer with the host's bounded source when one is available. */
const randomInt = (world: WorldActions, bound: number): number =>
    world.randomInt?.(bound) ?? Math.floor(world.random() * bound);

/** Draw a float with the host's source when one is available. */
const randomFloat = (world: WorldActions): number => world.randomFloat?.() ?? world.random();

/** Read the block's own data-driven flammability; a missing component is fireproof. */
const flammabilityOf = (world: WorldActions, block: HookBlock): BlockFlammability =>
    world.flammabilityOf?.(block) ?? { igniteOdds: 0, burnOdds: 0 };

/** The chance modifiers of one block state, or zeroes when it is fireproof. */
export const fireOddsOf = (world: WorldActions, block: HookBlock): BlockFlammability => flammabilityOf(world, block);

/** Whether the block catches fire at all. */
export const canBurn = (world: WorldActions, block: HookBlock): boolean => flammabilityOf(world, block).igniteOdds > 0;

/** Whether a block's top face can support fire. */
const hasSturdyTopFace = (world: WorldActions, block: HookBlock): boolean => {
    const supplied = world.hasSturdyTopFace?.(block);
    if (supplied !== undefined) return supplied;

    const lightDampening =
        world.lightDampeningOf?.(block) ??
        bedrockBlockPropertiesOf(block.identifier, block.states)?.lightDampening ??
        (isAir(block.identifier) ? 0 : 15);
    if (lightDampening === 15 || TRANSPARENT_FULL_CUBES.has(block.identifier)) return true;

    const half = block.states['minecraft:vertical_half'] ?? block.states['top_slot_bit'];
    return (
        half === 'top' ||
        half === true ||
        half === 1 ||
        block.states['upside_down_bit'] === true ||
        block.states['upside_down_bit'] === 1
    );
};

/** The maximum ignite odds around an empty position. */
export const igniteOddsAround = (world: WorldActions, at: BlockPosition): number => {
    if (!isAir(world.getBlock(at)?.identifier ?? AIR)) return 0;

    let odds = 0;
    for (const face of FIRE_DIRECTIONS) {
        const block = world.getBlock(offset(at, face));
        if (block !== undefined) odds = Math.max(odds, flammabilityOf(world, block).igniteOdds);
    }
    return odds;
};

/** Whether any of the six adjacent blocks can catch fire. */
export const isValidFireLocation = (world: WorldActions, at: BlockPosition): boolean =>
    FIRE_DIRECTIONS.some((face) => {
        const block = world.getBlock(offset(at, face));
        return block !== undefined && canBurn(world, block);
    });

/** Whether fire at this position can survive on its floor or beside fuel. */
export const canFireSurvive = (world: WorldActions, at: BlockPosition): boolean => {
    const below = world.getBlock(offset(at, 'down'));
    return (below !== undefined && hasSturdyTopFace(world, below)) || isValidFireLocation(world, at);
};

/** Whether rain reaches this position or one of its four horizontal neighbors. */
export const isNearRain = (world: WorldActions, at: BlockPosition): boolean => {
    const isRainingAt = world.isRainingAt ?? (() => false);
    return isRainingAt(at) || HORIZONTAL_FACES.some((face) => isRainingAt(offset(at, face)));
};

/** The first fire tick, 30 to 39 game ticks after placement. */
export const fireTickDelay = (world: WorldActions): number =>
    FIRE_TICK_DELAY_MIN + randomInt(world, FIRE_TICK_DELAY_SPREAD);

/** Remove a burned block, then leave either its replacement fire or air and tell its neighbors. */
const replaceBurnedBlock = (world: WorldActions, at: BlockPosition, replacementAge?: number): void => {
    world.destroyBlock?.(at, { drops: false });
    if (replacementAge === undefined) world.setBlock(at, AIR, {}, false);
    else world.setBlock(at, FIRE, fireWithAge(replacementAge), false);
    world.notifyNeighbors(at);
};

/** Burn one adjacent block according to its resolved destroy chance. */
export const checkBurnOut = (world: WorldActions, at: BlockPosition, chance: number, age: number): void => {
    const block = world.getBlock(at);
    const burnOdds = block === undefined ? 0 : flammabilityOf(world, block).burnOdds;
    if (randomInt(world, chance) >= burnOdds) return;

    if (randomInt(world, age + 10) < 5 && !(world.isRainingAt?.(at) ?? false)) {
        const replacementAge = Math.min(age + Math.floor(randomInt(world, 5) / 4), FIRE_MAX_AGE);
        replaceBurnedBlock(world, at, replacementAge);
    } else {
        replaceBurnedBlock(world, at);
    }
};

/** One fire tick's environment-specific switches. */
export interface FireTickOptions {
    /** Java's humid-biome attribute halves spread odds and narrows burnout denominators. */
    readonly increasedBurnout?: boolean;
    /** Whether the fire rule permits this position to spread around players. */
    readonly spreads?: boolean;
}

/**
 * Run Java's scheduled fire tick: reschedule, survive, burn neighbors, and spread.
 *
 * @param world - The block actions for the fire's dimension.
 * @param at - The fire's position.
 * @param dimension - The namespaced dimension identifier, which selects its `infiniburn` tag.
 * @param options - Overrides for environment facts a host supplies through the world actions.
 */
export const fireTick = (
    world: WorldActions,
    at: BlockPosition,
    dimension: string,
    options: FireTickOptions = {}
): void => {
    const state = world.getBlock(at);
    if (state === undefined || state.identifier !== FIRE) return;

    world.scheduleTick(at, fireTickDelay(world));
    const spreads = options.spreads ?? world.canFireSpreadAround?.(at) ?? true;
    if (!spreads) return;

    const below = world.getBlock(offset(at, 'down'));
    if (!canFireSurvive(world, at)) {
        world.setBlock(at, AIR, {}, false);
        world.notifyNeighbors(at);
        return;
    }

    const infiniburnTag = INFINIBURN_TAGS[dimension] ?? DEFAULT_INFINIBURN_TAG;
    const infiniteFire = below !== undefined && world.hasBlockTag?.(below, infiniburnTag) === true;
    let age = ageOf(state);
    const raining = (world.weather?.() ?? 'clear') !== 'clear';
    if (!infiniteFire && raining && isNearRain(world, at) && randomFloat(world) < 0.2 + age * 0.03) {
        world.setBlock(at, AIR, {}, false);
        world.notifyNeighbors(at);
        return;
    }

    const nextAge = Math.min(FIRE_MAX_AGE, age + Math.floor(randomInt(world, 3) / 2));
    if (age !== nextAge) {
        age = nextAge;
        world.setBlock(at, FIRE, fireWithAge(age), false);
    }

    if (!infiniteFire) {
        if (!isValidFireLocation(world, at)) {
            if (below === undefined || !hasSturdyTopFace(world, below) || age > 3) {
                world.setBlock(at, AIR, {}, false);
                world.notifyNeighbors(at);
            }
            return;
        }
        if (age === FIRE_MAX_AGE && randomInt(world, 4) === 0 && (below === undefined || !canBurn(world, below))) {
            world.setBlock(at, AIR, {}, false);
            world.notifyNeighbors(at);
            return;
        }
    }

    const increasedBurnout = options.increasedBurnout ?? world.increasedFireBurnout?.(at) ?? false;
    const burnoutAdjustment = increasedBurnout ? -50 : 0;
    checkBurnOut(world, offset(at, 'east'), 300 + burnoutAdjustment, age);
    checkBurnOut(world, offset(at, 'west'), 300 + burnoutAdjustment, age);
    checkBurnOut(world, offset(at, 'down'), 250 + burnoutAdjustment, age);
    checkBurnOut(world, offset(at, 'up'), 250 + burnoutAdjustment, age);
    checkBurnOut(world, offset(at, 'north'), 300 + burnoutAdjustment, age);
    checkBurnOut(world, offset(at, 'south'), 300 + burnoutAdjustment, age);

    const difficulty = world.difficulty?.() ?? 'normal';
    const difficultyId = ['peaceful', 'easy', 'normal', 'hard'].indexOf(difficulty);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 4; dy++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                let rate = 100;
                if (dy > 1) rate += (dy - 1) * 100;

                const testPosition = { x: at.x + dx, y: at.y + dy, z: at.z + dz };
                const igniteOdds = igniteOddsAround(world, testPosition);
                if (igniteOdds <= 0) continue;

                let odds = Math.floor((igniteOdds + 40 + difficultyId * 7) / (age + 30));
                if (increasedBurnout) odds = Math.floor(odds / 2);
                if (odds <= 0 || randomInt(world, rate) > odds) continue;
                if (raining && isNearRain(world, testPosition)) continue;

                const spreadAge = Math.min(FIRE_MAX_AGE, age + Math.floor(randomInt(world, 5) / 4));
                world.setBlock(testPosition, FIRE, fireWithAge(spreadAge), false);
                world.notifyNeighbors(testPosition);
            }
        }
    }
};
