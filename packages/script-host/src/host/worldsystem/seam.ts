/**
 * What the world and system members of `@minecraft/server` read and write of a world beyond its
 * entities and blocks: its clock, spawn, difficulty and game rules, its music, and the level
 * state those members keep. A world gives it as {@link ScriptWorld.worldSystem}; a world without
 * one gets {@link memoryWorldSystem}, which keeps the state for as long as the pack runs.
 *
 * Everything crosses as plain data, as the rest of the world seam does
 * ([ADR 0011](../../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 */
import type { ScriptBlockPermutation, ScriptItem, ScriptVector3 } from '../world';
import type { ScriptGameRuleName, ScriptGameRuleValue } from './gameRules';

/** A world's difficulty, as `Difficulty` names it. */
export type ScriptDifficulty = 'Easy' | 'Hard' | 'Normal' | 'Peaceful';

/** A track `world.playMusic` or `queueMusic` starts for every player. */
export interface ScriptMusic {
    readonly track: string;
    readonly volume: number;
    /** Seconds the track fades in over. */
    readonly fade: number;
    readonly loop: boolean;
    /** Whether it waits for the playing track to end, as `queueMusic` does. */
    readonly queue: boolean;
}

/**
 * What a block is to a search or a ray: nothing, a liquid, a block an entity walks through, such
 * as short grass, or a block an entity stands on. Water and lava count as passable as well.
 */
export type ScriptBlockKind = 'air' | 'liquid' | 'passable' | 'solid';

/** The light at a block, as `getLightLevel` and `getSkyLightLevel` read it, 0 to 15. */
export interface ScriptLight {
    /** The brightest of the block light and the sky light there; 0 inside an opaque block. */
    readonly level: number;
    /** The sky light there, read as if the block let it through, as BDS reads it. */
    readonly sky: number;
}

/** A biome as `BiomeType` reads it. */
export interface ScriptBiome {
    readonly id: string;
    readonly tags: readonly string[];
}

/** An explosion a script sets off, as `ExplosionOptions` describes it. */
export interface ScriptExplosion {
    readonly radius: number;
    readonly breaksBlocks: boolean;
    readonly causesFire: boolean;
    readonly allowUnderwater: boolean;
    /** The entity answerable for it. */
    readonly source?: string;
}

/** A rectangle of chunks, inclusive, by chunk coordinates. */
export interface ScriptChunkArea {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/** One of the scripts' ticking areas, as the world keeps it. */
export interface ScriptTickingArea {
    readonly identifier: string;
    readonly dimension: string;
    readonly chunks: ScriptChunkArea;
    /** Whether every chunk it covers is loaded. */
    readonly loaded: boolean;
}

/** A time marker a script added to the overworld's clock. */
export interface ScriptTimeMarker {
    readonly name: string;
    readonly time: number;
    /** Ticks between two of its times; absent for a marker that comes once. */
    readonly period?: number;
}

/** One layer of a player's fog stack: a fog definition's id and the tag a script gave it. */
export interface ScriptFogLayer {
    readonly fogId: string;
    readonly tag: string;
}

/** Where loot is rolled, for the conditions and functions that read the place. */
export interface ScriptLootPlace {
    readonly dimension: string;
    readonly location: ScriptVector3;
}

/** The world and system state the world and system members of a world's scripts reach. */
export interface ScriptWorldSystem {
    /** The world's time in ticks since it began, which `/time set` writes and every dimension shares. */
    absoluteTime(): number;
    setAbsoluteTime(time: number): void;
    difficulty(): ScriptDifficulty;
    setDifficulty(difficulty: ScriptDifficulty): void;
    /** The world's spawn, in whole blocks. */
    defaultSpawn(): ScriptVector3;
    setDefaultSpawn(location: ScriptVector3): void;
    gameRule(name: ScriptGameRuleName): ScriptGameRuleValue;
    setGameRule(name: ScriptGameRuleName, value: ScriptGameRuleValue): void;
    isHardcore(): boolean;
    /** The world's seed, as decimal digits. */
    seed(): string;
    allowCheats(): boolean;
    setAllowCheats(allow: boolean): void;
    playMusic(music: ScriptMusic): void;
    stopMusic(): void;
    /**
     * Stops a sound for every player in a dimension, or every sound when `sound` is undefined.
     */
    stopSound(dimension: string, sound?: string): void;
    /** What a block is to a search or a ray, by its type. */
    blockKind(typeId: string): ScriptBlockKind;
    /** The light at a block, or undefined when its chunk is not loaded. */
    light(dimension: string, location: ScriptVector3): ScriptLight | undefined;
    /** The biome at a location, or undefined when its chunk is not loaded. */
    biome(dimension: string, location: ScriptVector3): string | undefined;
    /** Every biome the world knows, with its tags. */
    biomes(): readonly ScriptBiome[];
    /**
     * The nearest location of a biome the world's generator would place, from its seed, or
     * undefined when it places none within reach.
     */
    findBiome(dimension: string, biome: string, from: ScriptVector3): ScriptVector3 | undefined;
    /** An entity's collision box, or undefined for one that is gone. */
    entityBox(id: string): { readonly min: ScriptVector3; readonly max: ScriptVector3 } | undefined;
    /** Drops a stack as an item entity that lies still, and returns its id, or undefined when none was made. */
    spawnItem(dimension: string, item: ScriptItem, location: ScriptVector3): string | undefined;
    /** Drops experience orbs worth `amount` points. */
    spawnXp(dimension: string, location: ScriptVector3, amount: number): void;
    explode(dimension: string, location: ScriptVector3, explosion: ScriptExplosion): void;
    /**
     * Places a feature, or a feature rule's feature, at a location.
     * @returns Whether it placed, or `unknown` for a name the world's packs do not define.
     */
    placeFeature(dimension: string, name: string, location: ScriptVector3, rule: boolean): boolean | 'unknown';
    /** The structures generation laid out over a location, by their feature type, such as `minecraft:village`. */
    generatedStructures(dimension: string, location: ScriptVector3): readonly string[];
    /** The scripts' ticking areas, in the order they were added; the command's are not among them. */
    tickingAreas(): readonly ScriptTickingArea[];
    /** Adds a ticking area over the chunks a block box covers, which starts them loading. */
    addTickingArea(identifier: string, dimension: string, chunks: ScriptChunkArea): void;
    /** Removes a ticking area, and returns whether there was one. */
    removeTickingArea(identifier: string): boolean;
    /** A behavior pack loot table's JSON, by its path such as `loot_tables/entities/pig.json`. */
    lootTable(path: string): unknown;
    /** Rolls a loot table by its path, or undefined for one the packs do not have. */
    rollLootTable(path: string, tool?: ScriptItem): readonly ScriptItem[] | undefined;
    /** What a block drops when broken with a tool, or undefined when the tool cannot harvest it. */
    rollBlockLoot(
        permutation: ScriptBlockPermutation,
        tool?: ScriptItem,
        place?: ScriptLootPlace
    ): readonly ScriptItem[] | undefined;
    /** What an entity of a type drops when it dies. */
    rollEntityLoot(typeId: string, tool?: ScriptItem, place?: ScriptLootPlace): readonly ScriptItem[] | undefined;
    /** Whether a script paused the overworld's clock. */
    clockPaused(): boolean;
    setClockPaused(paused: boolean): void;
    /** The time markers scripts added to the overworld's clock, in the order they were added. */
    timeMarkers(): readonly ScriptTimeMarker[];
    addTimeMarker(marker: ScriptTimeMarker): void;
    removeTimeMarker(name: string): void;
    /** A player's fog stack, bottom first, or undefined for a player who is gone. */
    fogStack(player: string): readonly ScriptFogLayer[] | undefined;
    /** Replaces a player's fog stack, which the player's client then draws. */
    setFogStack(player: string, layers: readonly ScriptFogLayer[]): void;
    /** A block type's Bedrock tags, as a block filter's tags match them. */
    blockTags(typeId: string): readonly string[];
}
