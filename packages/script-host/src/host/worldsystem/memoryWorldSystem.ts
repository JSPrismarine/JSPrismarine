/**
 * The world and system state of a world that keeps none of its own: a new world's, as BDS
 * starts one, kept for as long as the pack runs.
 */
import type { ScriptVector3, ScriptWorld } from '../world';
import type { ScriptGameRuleName, ScriptGameRuleValue } from './gameRules';
import { SCRIPT_GAME_RULES } from './gameRules';
import type {
    ScriptBlockKind,
    ScriptChunkArea,
    ScriptDifficulty,
    ScriptExplosion,
    ScriptFogLayer,
    ScriptMusic,
    ScriptTimeMarker,
    ScriptWorldSystem
} from './seam';

/** What a {@link memoryWorldSystem} was asked to play, for a test to read. */
export interface MemoryWorldSystem extends ScriptWorldSystem {
    readonly music: ScriptMusic[];
    readonly stoppedSounds: string[];
    readonly explosions: ScriptExplosion[];
}

/** The kinds of the blocks a memory world knows; any other block is solid. */
const KINDS: Readonly<Record<string, ScriptBlockKind>> = {
    'minecraft:air': 'air',
    'minecraft:water': 'liquid',
    'minecraft:lava': 'liquid',
    'minecraft:short_grass': 'passable',
    'minecraft:torch': 'passable'
};

/** The biomes a memory world knows, with BDS's tags. */
const BIOMES = [
    { id: 'minecraft:plains', tags: ['animal', 'bee_habitat', 'monster', 'overworld', 'plains'] },
    { id: 'minecraft:desert', tags: ['desert', 'monster', 'overworld'] }
];

/**
 * The loot tables a memory world has: the pig's, as the behavior pack writes it, and a chest's
 * with the enchanting functions as the vanilla tables write them.
 */
const LOOT_TABLES: Readonly<Record<string, unknown>> = {
    'loot_tables/entities/pig.json': {
        pools: [
            {
                rolls: 1,
                entries: [
                    {
                        type: 'item',
                        name: 'minecraft:porkchop',
                        weight: 1,
                        functions: [
                            { function: 'set_count', count: { min: 1, max: 3 } },
                            {
                                function: 'furnace_smelt',
                                conditions: [{ condition: 'entity_properties', entity: 'this' }]
                            },
                            { function: 'looting_enchant', count: { min: 0, max: 1 } }
                        ],
                        pools: [
                            {
                                rolls: 2,
                                conditions: [{ condition: 'random_difficulty_chance', default_chance: 0.5, hard: 0.6 }]
                            }
                        ]
                    }
                ]
            }
        ]
    },
    'loot_tables/chests/enchanted.json': {
        pools: [
            {
                rolls: 1,
                entries: [
                    {
                        type: 'item',
                        name: 'minecraft:diamond_sword',
                        weight: 1,
                        functions: [
                            { function: 'enchant_with_levels', levels: 30, treasure: true },
                            { function: 'enchant_randomly' },
                            { function: 'enchant_random_gear', chance: 0.25 }
                        ]
                    }
                ]
            }
        ]
    }
};

/** Half the width and the height of the box a memory world gives every entity: a pig's. */
const BOX = { half: 0.45, height: 0.9 };

/**
 * A world system in memory, with BDS's defaults and the spawn at the origin, over a world whose
 * entities it spawns and whose blocks it breaks.
 */
export const memoryWorldSystem = (seed = '0', world?: ScriptWorld): MemoryWorldSystem => {
    let time = 0;
    let difficulty: ScriptDifficulty = 'Easy';
    let spawn: ScriptVector3 = { x: 0, y: 64, z: 0 };
    let cheats = true;
    const rules = new Map<ScriptGameRuleName, ScriptGameRuleValue>();
    const music: ScriptMusic[] = [];
    const stoppedSounds: string[] = [];
    const explosions: ScriptExplosion[] = [];
    const areas = new Map<string, { readonly dimension: string; readonly chunks: ScriptChunkArea }>();
    const markers: ScriptTimeMarker[] = [];
    let paused = false;
    const fogs = new Map<string, readonly ScriptFogLayer[]>();
    const summon = (dimension: string, typeId: string, location: ScriptVector3): string | undefined => {
        const made = world?.spawnEntity(dimension, typeId, location);
        return made === undefined || made === 'unknown-type' || made === 'unloaded' ? undefined : made;
    };
    return {
        music,
        stoppedSounds,
        explosions,
        absoluteTime: () => time,
        setAbsoluteTime: (value) => {
            time = value;
        },
        difficulty: () => difficulty,
        setDifficulty: (value) => {
            difficulty = value;
        },
        defaultSpawn: () => spawn,
        setDefaultSpawn: (location) => {
            spawn = location;
        },
        gameRule: (name) => rules.get(name) ?? SCRIPT_GAME_RULES[name].default,
        setGameRule: (name, value) => void rules.set(name, value),
        isHardcore: () => false,
        seed: () => seed,
        allowCheats: () => cheats,
        setAllowCheats: (allow) => {
            cheats = allow;
        },
        playMusic: (track) => {
            if (!track.queue) music.length = 0;
            music.push(track);
        },
        stopMusic: () => {
            music.length = 0;
        },
        stopSound: (dimension, sound) => void stoppedSounds.push(`${dimension} ${sound ?? '*'}`),
        blockKind: (typeId) => KINDS[typeId] ?? 'solid',
        light: (dimension, location) => {
            const block = world?.block(dimension, location);
            if (block === undefined) return undefined;
            return { level: (KINDS[block.typeId] ?? 'solid') === 'solid' ? 0 : 15, sky: 15 };
        },
        biome: (dimension, location) =>
            world?.block(dimension, location) === undefined ? undefined : 'minecraft:plains',
        biomes: () => BIOMES,
        findBiome: (_dimension, biome, from) => (biome === 'minecraft:plains' ? from : undefined),
        entityBox: (id) => {
            const entity = world?.entity(id);
            if (entity === undefined) return undefined;
            const { x, y, z } = entity.location;
            return {
                min: { x: x - BOX.half, y, z: z - BOX.half },
                max: { x: x + BOX.half, y: y + BOX.height, z: z + BOX.half }
            };
        },
        spawnItem: (dimension, _item, location) => summon(dimension, 'minecraft:item', location),
        spawnXp: (dimension, location) => void summon(dimension, 'minecraft:xp_orb', location),
        explode: (dimension, location, explosion) => {
            explosions.push(explosion);
            const at = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
            const air = world?.resolveBlock('minecraft:air', {});
            if (explosion.breaksBlocks && air !== undefined) world?.setBlock(dimension, at, air);
        },
        placeFeature: (_dimension, name) => (name.startsWith('minecraft:') ? false : 'unknown'),
        generatedStructures: () => [],
        tickingAreas: () =>
            [...areas].map(([identifier, { dimension, chunks }]) => ({
                identifier,
                dimension,
                chunks,
                loaded:
                    world?.block(dimension, { x: chunks.minX * 16, y: 0, z: chunks.minZ * 16 }) !== undefined &&
                    world.block(dimension, { x: chunks.maxX * 16, y: 0, z: chunks.maxZ * 16 }) !== undefined
            })),
        addTickingArea: (identifier, dimension, chunks) => void areas.set(identifier, { dimension, chunks }),
        removeTickingArea: (identifier) => areas.delete(identifier),
        lootTable: (path) => LOOT_TABLES[path],
        rollLootTable: (path) => (path in LOOT_TABLES ? [{ typeId: 'minecraft:porkchop', amount: 1 }] : undefined),
        rollBlockLoot: (permutation, tool) =>
            permutation.typeId === 'minecraft:stone' && tool === undefined
                ? undefined
                : permutation.typeId === 'minecraft:air'
                  ? []
                  : [{ typeId: permutation.typeId, amount: 1 }],
        rollEntityLoot: (typeId) => (typeId === 'minecraft:pig' ? [{ typeId: 'minecraft:porkchop', amount: 1 }] : []),
        clockPaused: () => paused,
        setClockPaused: (value) => {
            paused = value;
        },
        fogStack: (player) => (world?.entity(player) === undefined ? undefined : (fogs.get(player) ?? [])),
        setFogStack: (player, layers) => void fogs.set(player, layers),
        blockTags: (typeId) => (typeId === 'minecraft:stone' ? ['stone'] : []),
        timeMarkers: () => markers,
        addTimeMarker: (marker) => void markers.push(marker),
        removeTimeMarker: (name) => {
            const at = markers.findIndex((marker) => marker.name === name);
            if (at >= 0) markers.splice(at, 1);
        }
    };
};
