import type { Difficulty } from './rules';

/**
 * What the spawner reads about the world.
 *
 * Every fact a spawn rule asks for arrives through this one interface, so a
 * test drives the whole algorithm with a typed double and a server implements
 * it once against its own chunks, light engine and entity index.
 */

/** A block position. Spawn positions are integers; distances are measured between centers. */
export interface SpawnPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The boolean facts about one position, each named by the rule component or
 * filter test that reads it.
 *
 * `surface` and `underground` select the pass; `underwater` and `lava` are the
 * medium the position sits in; `bubble_column` answers
 * `minecraft:disallow_spawns_in_bubble`; `snow_covered` answers the one
 * `is_snow_covered` test a vanilla biome filter writes.
 */
export const SPAWN_SITE_FLAGS = [
    'surface',
    'underground',
    'underwater',
    'lava',
    'bubble_column',
    'snow_covered'
] as const;

/** One of {@link SPAWN_SITE_FLAGS}. */
export type SpawnSiteFlag = (typeof SPAWN_SITE_FLAGS)[number];

/** Which of the two passes a position belongs to. */
export type SpawnPass = 'surface' | 'underground';

/** The weather names `adjust_for_weather` reads. */
export const SPAWN_WEATHER = ['clear', 'rain', 'thunder'] as const;

/** One of {@link SPAWN_WEATHER}. */
export type SpawnWeather = (typeof SPAWN_WEATHER)[number];

/** One player the spawner spawns around. */
export interface SpawnPlayer {
    readonly position: SpawnPosition;
}

/** Everything one spawn cycle reads about the world. */
export interface SpawnWorld {
    /** A boolean fact about one position, named by the component that reads it. */
    site(flag: SpawnSiteFlag, at: SpawnPosition): boolean;
    /**
     * The block identifier at one position, or undefined when the chunk is not
     * loaded, which stops the attempt.
     */
    block(at: SpawnPosition): string | undefined;
    /**
     * The light level at one position, 0 to 15, before this package applies the
     * weather darkening that `adjust_for_weather` asks for.
     */
    light(at: SpawnPosition): number;
    /** The biome tags at one position, which is what `has_biome_tag` compares. */
    biomeTags(at: SpawnPosition): readonly string[];
    /** The biome name at one position, for `is_biome`. */
    biome?(at: SpawnPosition): string;
    /** The players the spawner spawns around, which is every player in the spawn region. */
    players(): readonly SpawnPlayer[];
    /** How many entities of one population pool stand in the spawn region now. */
    poolCount(pool: string): number;
    /** How many entities of one type stand within `radius` blocks of a position. */
    typeCount(identifier: string, at: SpawnPosition, radius: number): number;
    difficulty(): Difficulty;
    weather(): SpawnWeather;
    /** The world's age in ticks, which is what `minecraft:world_age_filter` compares. */
    age(): number;
    /** Whether a named mob event, such as `minecraft:pillager_patrols_event`, is running. */
    mobEventActive(event: string): boolean;
    /**
     * How far a position is from the nearest village border, negative inside it
     * and undefined when no village is near. `minecraft:player_in_village_filter`
     * reads it.
     */
    villageBorderDistance?(at: SpawnPosition): number | undefined;
}

/** The squared distance between two positions, which is what the range checks compare. */
export const distanceSquared = (from: SpawnPosition, to: SpawnPosition): number => {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const dz = from.z - to.z;
    return dx * dx + dy * dy + dz * dz;
};

/** Which pass a position belongs to, which the world decides and the conditions read. */
export const passAt = (world: SpawnWorld, at: SpawnPosition): SpawnPass =>
    world.site('underground', at) ? 'underground' : 'surface';
