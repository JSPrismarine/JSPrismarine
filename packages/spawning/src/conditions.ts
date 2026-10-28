import type { EvaluateFilterOptions, FilterContext, FilterEntityView } from '@jsprismarine/entities';
import { evaluateFilter } from '@jsprismarine/entities';
import type { RandomSource } from '@jsprismarine/predicates';

import type { SpawnConstants } from './constants';
import { SPAWN_CONSTANTS } from './constants';
import type { Difficulty, SpawnCondition, SpawnDelay, SpawnRuleComponent } from './rules';
import { DIFFICULTIES } from './rules';
import type { SpawnPass, SpawnPosition, SpawnWorld } from './world';
import { distanceSquared, passAt } from './world';

/**
 * Deciding whether one condition of a spawn rule allows a position.
 *
 * A rule's `conditions` are alternatives: the rule allows a position when any
 * one condition does. Each condition is a conjunction of its components, and
 * this module reports which component rejected a position so a server can
 * explain an empty spawn attempt and a test can name the component it covers.
 *
 * `minecraft:biome_filter` goes through the filter evaluator of
 * `@jsprismarine/entities`, because spawn rules, entity definitions and trade
 * tables share one filter grammar and one evaluator.
 */

/** What one condition evaluation produced. */
export interface SpawnConditionResult {
    readonly passed: boolean;
    /** The first component that rejected the position, absent when the condition passed. */
    readonly rejectedBy?: SpawnRuleComponent;
}

/** Reads the cooldowns `minecraft:delay_filter` keeps, keyed by its `identifier`. */
export interface SpawnDelayView {
    /** The tick the named cooldown next allows a spawn, or undefined when it has never run. */
    readyAt(identifier: string): number | undefined;
}

/**
 * The cooldowns `minecraft:delay_filter` keeps.
 *
 * The three pillager patrol conditions each name their own identifier, which
 * is how one per-difficulty cooldown exists per world rather than one per
 * condition.
 */
export class SpawnDelays implements SpawnDelayView {
    private readonly ready = new Map<string, number>();

    /** The tick the named cooldown next allows a spawn, or undefined when it has never run. */
    public readyAt(identifier: string): number | undefined {
        return this.ready.get(identifier);
    }

    /** Sets the tick at which the named cooldown allows the next spawn. */
    public schedule(identifier: string, tick: number): void {
        this.ready.set(identifier, tick);
    }

    /** Draws a delay inside the filter's range and schedules it from `tick`. */
    public scheduleFrom(delay: SpawnDelay, tick: number, random: RandomSource): void {
        if (delay.identifier === undefined) return;
        const span = Math.max(0, delay.max - delay.min);
        this.schedule(delay.identifier, tick + delay.min + Math.floor(random.nextFloat() * (span + 1)));
    }
}

/** Everything one condition evaluation needs beyond the condition and the position. */
export interface SpawnConditionContext {
    readonly world: SpawnWorld;
    /** The entity the rule spawns, which `minecraft:density_limit` counts. */
    readonly identifier: string;
    readonly random: RandomSource;
    /** The current world tick, which `minecraft:delay_filter` compares. */
    readonly tick: number;
    readonly constants?: SpawnConstants;
    readonly delays?: SpawnDelayView;
    /** Receives every biome filter test the evaluator could not answer. */
    readonly onUnanswered?: EvaluateFilterOptions['onUnanswered'];
}

const rejected = (component: SpawnRuleComponent): SpawnConditionResult => ({ passed: false, rejectedBy: component });

const PASSED: SpawnConditionResult = { passed: true };

/**
 * Builds the filter context a `minecraft:biome_filter` reads.
 *
 * A spawn rule has no entity yet, so the `self` subject is the position: its
 * biome tags answer `has_biome_tag`, its biome answers `is_biome`, and its
 * site flags answer `is_snow_covered`, `is_underground`, `is_underwater` and
 * `in_lava`. Every other test the shared grammar allows goes unanswered and is
 * reported, which is what the engine does for a fact it cannot establish.
 */
export const spawnFilterContext = (world: SpawnWorld, at: SpawnPosition): FilterContext => {
    const self: FilterEntityView = {
        flag: (name) => {
            switch (name) {
                case 'is_snow_covered':
                    return world.site('snow_covered', at);
                case 'is_underground':
                    return world.site('underground', at);
                case 'is_underwater':
                case 'in_water':
                    return world.site('underwater', at);
                case 'in_lava':
                    return world.site('lava', at);
                default:
                    return undefined;
            }
        },
        names: (name) => {
            if (name === 'has_biome_tag') return world.biomeTags(at);
            if (name === 'is_biome') {
                const biome = world.biome?.(at);
                return biome === undefined ? undefined : [biome];
            }
            return undefined;
        }
    };

    return {
        self,
        world: { difficulty: () => world.difficulty(), weather: () => world.weather() }
    };
};

/** The light a brightness filter compares, after the darkening weather applies to it. */
const brightnessAt = (
    world: SpawnWorld,
    at: SpawnPosition,
    adjustForWeather: boolean,
    constants: SpawnConstants
): number => {
    const light = world.light(at);
    if (!adjustForWeather) return light;
    const weather = world.weather();
    if (weather === 'rain') return Math.max(0, light - constants.rainDarkening);
    if (weather === 'thunder') return Math.max(0, light - constants.thunderDarkening);
    return light;
};

const difficultyRank = (difficulty: Difficulty): number => DIFFICULTIES.indexOf(difficulty);

/** The distance from a position to the nearest player, or undefined when no player is loaded. */
const nearestPlayerDistance = (world: SpawnWorld, at: SpawnPosition): number | undefined => {
    let best: number | undefined;
    for (const player of world.players()) {
        const distance = distanceSquared(player.position, at);
        if (best === undefined || distance < best) best = distance;
    }
    return best === undefined ? undefined : Math.sqrt(best);
};

const matchesBlock = (identifier: string | undefined, names: readonly string[]): boolean =>
    identifier !== undefined && names.includes(identifier);

/**
 * Decides whether one condition allows a spawn at a position.
 *
 * The components run cheapest first, and the first one that rejects names
 * itself in the result. A condition that declares neither
 * `minecraft:spawns_underwater` nor `minecraft:spawns_lava` refuses a position
 * inside either liquid, which is the reading that keeps land mobs out of the
 * ocean; Mojang states the components and not that rule.
 *
 * @param requestedPass - The pass the spawn loop is evaluating, or absent to
 *   derive it from the world's site facts.
 */
export const evaluateSpawnCondition = (
    condition: SpawnCondition,
    at: SpawnPosition,
    context: SpawnConditionContext,
    requestedPass?: SpawnPass
): SpawnConditionResult => {
    const { world } = context;
    const constants = context.constants ?? SPAWN_CONSTANTS;
    const pass = requestedPass ?? passAt(world, at);

    if (condition.spawnsOnSurface || condition.spawnsUnderground) {
        if (pass === 'surface' && !condition.spawnsOnSurface) return rejected('minecraft:spawns_underground');
        if (pass === 'underground' && !condition.spawnsUnderground) return rejected('minecraft:spawns_on_surface');
    }

    const inWater = world.site('underwater', at);
    const inLava = world.site('lava', at);
    if (condition.spawnsUnderwater && !inWater) return rejected('minecraft:spawns_underwater');
    if (condition.spawnsLava && !inLava) return rejected('minecraft:spawns_lava');
    if (!condition.spawnsUnderwater && inWater) return rejected('minecraft:spawns_underwater');
    if (!condition.spawnsLava && inLava) return rejected('minecraft:spawns_lava');

    if (condition.disallowSpawnsInBubble && world.site('bubble_column', at))
        return rejected('minecraft:disallow_spawns_in_bubble');

    if (condition.height !== undefined && (at.y < condition.height.min || at.y > condition.height.max))
        return rejected('minecraft:height_filter');

    if (condition.blocks !== undefined) {
        const below = world.block({ x: at.x, y: at.y - 1, z: at.z });
        if (!matchesBlock(below, condition.blocks)) return rejected('minecraft:spawns_on_block_filter');
    }

    if (condition.preventedBlocks !== undefined) {
        const below = world.block({ x: at.x, y: at.y - 1, z: at.z });
        if (matchesBlock(below, condition.preventedBlocks))
            return rejected('minecraft:spawns_on_block_prevented_filter');
    }

    if (condition.aboveBlocks !== undefined) {
        // The component names no direction. "Spawns above block" reads as the
        // entity standing above one of the blocks, so the scan runs downward
        // from the position for `distance` blocks.
        let found = false;
        for (let depth = 1; depth <= condition.aboveBlocks.distance && !found; depth += 1) {
            found = matchesBlock(world.block({ x: at.x, y: at.y - depth, z: at.z }), condition.aboveBlocks.blocks);
        }
        if (!found) return rejected('minecraft:spawns_above_block_filter');
    }

    if (condition.brightness !== undefined) {
        const light = brightnessAt(world, at, condition.brightness.adjustForWeather, constants);
        if (light < condition.brightness.min || light > condition.brightness.max)
            return rejected('minecraft:brightness_filter');
    }

    if (condition.difficulty !== undefined) {
        const rank = difficultyRank(world.difficulty());
        if (rank < difficultyRank(condition.difficulty.min) || rank > difficultyRank(condition.difficulty.max))
            return rejected('minecraft:difficulty_filter');
    }

    if (condition.worldAge !== undefined) {
        const age = world.age();
        if (age < condition.worldAge.min) return rejected('minecraft:world_age_filter');
        if (condition.worldAge.max >= 0 && age > condition.worldAge.max) return rejected('minecraft:world_age_filter');
    }

    if (condition.mobEvent !== undefined && !world.mobEventActive(condition.mobEvent))
        return rejected('minecraft:mob_event_filter');

    if (condition.distance !== undefined) {
        const distance = nearestPlayerDistance(world, at);
        if (distance === undefined || distance < condition.distance.min || distance > condition.distance.max)
            return rejected('minecraft:distance_filter');
    }

    if (condition.playerInVillage !== undefined) {
        const { distance, villageBorderTolerance } = condition.playerInVillage;
        const inRange = world.players().filter((player) => distanceSquared(player.position, at) <= distance * distance);
        const nearVillage = inRange.some((player) => {
            const border = world.villageBorderDistance?.(player.position);
            return border !== undefined && border <= villageBorderTolerance;
        });
        if (!nearVillage) return rejected('minecraft:player_in_village_filter');
    }

    if (condition.biomeFilter !== undefined) {
        const options: EvaluateFilterOptions = {};
        if (context.onUnanswered !== undefined) options.onUnanswered = context.onUnanswered;
        if (!evaluateFilter(condition.biomeFilter, spawnFilterContext(world, at), options))
            return rejected('minecraft:biome_filter');
    }

    if (condition.density !== undefined) {
        const limit = pass === 'surface' ? condition.density.surface : condition.density.underground;
        if (limit >= 0 && world.typeCount(context.identifier, at, constants.densityRadius) >= limit)
            return rejected('minecraft:density_limit');
    }

    if (condition.delay !== undefined) {
        const identifier = condition.delay.identifier;
        const readyAt = identifier === undefined ? undefined : context.delays?.readyAt(identifier);
        if (readyAt !== undefined && context.tick < readyAt) return rejected('minecraft:delay_filter');
        if (context.random.nextFloat() * 100 >= condition.delay.spawnChance) return rejected('minecraft:delay_filter');
    }

    return PASSED;
};
