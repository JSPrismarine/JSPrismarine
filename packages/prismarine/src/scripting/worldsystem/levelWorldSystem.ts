/**
 * The level side of the script host's world system: one level's clock, spawn, difficulty, game
 * rules and music, as `world`, `world.gameRules` and a dimension's sound members read and write
 * them. A write goes through the verb its command uses, so a script's `setAbsoluteTime` is a
 * `/time set` and its `setDifficulty` a `/difficulty`.
 */
import { scriptHostVerbs } from '../scriptHostVerbs';
import type { ScriptGameRuleName, ScriptGameRuleValue } from '@jsprismarine/script-host/host/worldsystem/gameRules';
import { SCRIPT_GAME_RULES } from '@jsprismarine/script-host/host/worldsystem/gameRules';
import type {
    ScriptBiome,
    ScriptBlockKind,
    ScriptDifficulty,
    ScriptFogLayer,
    ScriptWorldSystem
} from '@jsprismarine/script-host/host/worldsystem/seam';
import type { ScriptItem, ScriptVector3 } from '@jsprismarine/script-host/host/world';
import { legacy_item_aliases, legacy_item_aux_aliases } from '@jsprismarine/bedrock-data';
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import PlayerFogPacket from '@jsprismarine/protocol/bedrock/packet/PlayerFogPacket';
import StopSoundPacket from '@jsprismarine/protocol/bedrock/packet/StopSoundPacket';
import { Vector3 } from '@jsprismarine/math';

import { blockFromContent } from '../../block/Block';
import { rollBlockDrops } from '../../block/blockLoot';
import type { ContentItemDrop } from '../../content/world/adapter';
import { javaLootIdOf } from '../../entity/data/facts';
import { rollMobDrops } from '../../entity/mobLoot';
import { bedrockItemDrops } from '../../item/bedrockDrops';
import { dropOfRolledStack } from '../../item/lootStack';
import { lootLevelOf } from '../../world/lootLevel';
import { difficultyName } from '../../config/Config';
import { parseBiomeTags } from '../../content/biomeTags';
import { explode } from '../../entity/Explosion';
import { storedItem } from '../../inventory/persistence';
import { itemFromContent } from '../../item/itemFromContent';
import { customMusicPacket } from '../../editions/bedrock/customMusic';
import type PlayerSession from '../../player/PlayerSession';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { World } from '../../world/World';

/** The difficulty names the Script API uses, by the lowercase name the config keeps. */
const SCRIPT_DIFFICULTY: Readonly<Record<string, ScriptDifficulty>> = {
    peaceful: 'Peaceful',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard'
};

/** The liquids, which a script's search skips unless it asks for them. */
const LIQUIDS: ReadonlySet<string> = new Set([
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava'
]);

/** The light filter of a block no light passes. */
const OPAQUE = 15;

/**
 * The feature type BDS reports for each Java structure, by the structure's name without its
 * namespace: the start of the name for a family such as `village_plains`, else the whole name.
 */
const FEATURE_TYPES: readonly (readonly [prefix: string, feature: string])[] = [
    ['village', 'minecraft:village'],
    ['ancient_city', 'minecraft:ancient_city'],
    ['bastion', 'minecraft:bastion_remnant'],
    ['buried_treasure', 'minecraft:buried_treasure'],
    ['end_city', 'minecraft:end_city'],
    ['fortress', 'minecraft:fortress'],
    ['mansion', 'minecraft:mansion'],
    ['mineshaft', 'minecraft:mineshaft'],
    ['monument', 'minecraft:monument'],
    ['ocean_ruin', 'minecraft:ocean_ruins'],
    ['pillager_outpost', 'minecraft:pillager_outpost'],
    ['ruined_portal', 'minecraft:ruined_portal'],
    ['shipwreck', 'minecraft:shipwreck'],
    ['stronghold', 'minecraft:stronghold'],
    ['trail_ruins', 'minecraft:trail_ruins'],
    ['trial_chambers', 'minecraft:trial_chambers'],
    ['desert_pyramid', 'minecraft:temple'],
    ['jungle_pyramid', 'minecraft:temple'],
    ['swamp_hut', 'minecraft:temple'],
    ['igloo', 'minecraft:temple']
];

/** The chunks around a location whose structure starts a script's `getGeneratedStructures` reads. */
const STRUCTURE_REACH = 4;

/** A generator that can say which structures start in a chunk, as the data-driven one can. */
interface StructureStarts {
    structureStartsAt(
        chunkX: number,
        chunkZ: number,
        seed: bigint
    ): readonly {
        readonly structure: string;
        readonly boundingBox: {
            readonly minX: number;
            readonly minY: number;
            readonly minZ: number;
            readonly maxX: number;
            readonly maxY: number;
            readonly maxZ: number;
        };
    }[];
}

const hasStructureStarts = (generator: object): generator is StructureStarts =>
    'structureStartsAt' in generator && typeof generator.structureStartsAt === 'function';

/**
 * An item name a behavior pack's loot table writes, as the item is called now: Mojang's tables
 * still write names such as `record_13` and `appleEnchanted`, and BDS reads each under its
 * current name, a name that varied by its aux value under the one for aux 0, as `dye` reads as
 * `ink_sac` whatever its `set_data` says.
 */
const currentItemName = (name: string): string => {
    const qualified = (name.includes(':') ? name : `minecraft:${name}`).toLowerCase();
    return legacy_item_aliases[qualified] ?? legacy_item_aux_aliases[qualified]?.['0'] ?? name;
};

/** A loot table's JSON with every item entry's name as the item is called now. */
const withCurrentItemNames = (json: unknown): unknown => {
    if (Array.isArray(json)) return json.map(withCurrentItemNames);
    if (typeof json !== 'object' || json === null) return json;
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) copy[key] = withCurrentItemNames(value);
    if (copy.type === 'item' && typeof copy.name === 'string') copy.name = currentItemName(copy.name);
    return copy;
};

/** A rolled drop as a script's item stack, or undefined for an empty one. */
const scriptItemOfDrop = (drop: ContentItemDrop): ScriptItem | undefined =>
    drop.identifier === 'minecraft:air' || drop.count <= 0
        ? undefined
        : {
              typeId: drop.identifier,
              amount: drop.count,
              ...(drop.customName === undefined ? {} : { nameTag: drop.customName }),
              ...(drop.lore === undefined || drop.lore.length === 0 ? {} : { lore: drop.lore }),
              ...(drop.damage === undefined || drop.damage <= 0 ? {} : { damage: drop.damage })
          };

const scriptItems = (drops: readonly ContentItemDrop[]): ScriptItem[] =>
    drops.flatMap((drop) => {
        const item = scriptItemOfDrop(drop);
        return item === undefined ? [] : [item];
    });

/**
 * Builds the world system of one level's scripts.
 * @param server - The server whose commands, config and sessions the scripts reach.
 * @param level - The level the scripts run in.
 */
export const levelWorldSystem = (server: Server, level: Level): ScriptWorldSystem => {
    const verb = scriptHostVerbs(server, level);
    const sessions = (): PlayerSession[] =>
        server
            .getSessionManager()
            .getSessions()
            .filter((session) => session.getWorld().getLevel() === level);
    const overworld = () =>
        [...level.worlds()].find((world) => world.getDimension().bedrockName === 'minecraft:overworld');
    // The locator bar has no game rule on the wire, and cheats no setting, so the level keeps
    // them, and the clock's markers, for its scripts and saves them. The clock's pause is the
    // level's own clock's.
    const settings = level.getScriptSettings();
    /** Each player's fog stack as the scripts built it, by entity id. */
    const fogs = new Map<string, readonly ScriptFogLayer[]>();

    const worldOf = (dimension: string): World | undefined =>
        [...level.worlds()].find((world) => world.getDimension().bedrockName === dimension);
    const kinds = new Map<string, ScriptBlockKind>();
    const blockKind = (typeId: string): ScriptBlockKind => {
        let kind = kinds.get(typeId);
        if (kind === undefined) {
            const block = blockFromContent(typeId, server.getContent());
            kind =
                typeId === 'minecraft:air'
                    ? 'air'
                    : LIQUIDS.has(typeId)
                      ? 'liquid'
                      : block?.isSolid() === false
                        ? 'passable'
                        : 'solid';
            kinds.set(typeId, kind);
        }
        return kind;
    };
    let biomes: { readonly content: unknown; readonly list: readonly ScriptBiome[] } | undefined;

    const gameRule = (name: ScriptGameRuleName): ScriptGameRuleValue => {
        if (name === 'playerWaypoints') return settings.playerWaypoints;
        return level.getGameRuleManager().findGameRule(name)?.[0] ?? SCRIPT_GAME_RULES[name].default;
    };

    return {
        absoluteTime: () => level.getDayTime(),
        setAbsoluteTime: (time) => verb((host) => host.world.setTime(time)),
        difficulty: () => SCRIPT_DIFFICULTY[difficultyName(server.getConfig().getDifficulty())] ?? 'Normal',
        setDifficulty: (difficulty) => void verb((host) => host.world.setDifficulty(difficulty)),
        defaultSpawn: () => {
            const spawn = overworld()?.getKnownSpawnPosition() ?? level.getSpawn();
            return spawn === null || spawn === undefined
                ? { x: 0, y: 64, z: 0 }
                : { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() };
        },
        setDefaultSpawn: (location) =>
            void verb((host) => host.world.setWorldSpawn('minecraft:overworld', location, 0)),
        gameRule,
        setGameRule: (name, value) => {
            if (name === 'playerWaypoints') {
                if (value === 'Everyone' || value === 'Off') settings.playerWaypoints = value;
                return;
            }
            if (typeof value === 'string') return;
            level.getGameRuleManager().setGameRule(name, value, true);
        },
        isHardcore: () => level.isHardcore(),
        seed: () => level.seed.toString(),
        allowCheats: () => settings.allowCheats,
        setAllowCheats: (allow) => {
            settings.allowCheats = allow;
        },
        // BDS sends every player the music packets `Player.playMusic` sends one, and the client keeps the queue.
        playMusic: ({ track, volume, fade, loop, queue }) => {
            for (const session of sessions()) {
                const packet = customMusicPacket({ action: queue ? 'queue' : 'play', track, volume, fade, loop });
                session.released(session.send(packet));
            }
        },
        stopMusic: () => {
            for (const session of sessions()) session.released(session.send(customMusicPacket({ action: 'stop' })));
        },
        blockKind,
        light: (dimension, { x, y, z }) => {
            const world = worldOf(dimension);
            const block = world?.loadedBlock(x, y, z);
            if (world === undefined || block === undefined) return undefined;
            const systems = world.getSystems();
            const sky = (at: ScriptVector3) => systems.getSkyLight(at.x, at.y, at.z);
            if (block.getLightFilter() < OPAQUE) {
                const here = sky({ x, y, z });
                return { level: Math.max(systems.getBlockLight(x, y, z), here), sky: here };
            }
            // BDS reads the sky light in an opaque block as if the block let it through.
            const through = Math.max(
                sky({ x, y: y + 1, z }),
                ...[
                    { x: x + 1, y, z },
                    { x: x - 1, y, z },
                    { x, y, z: z + 1 },
                    { x, y, z: z - 1 },
                    { x, y: y - 1, z }
                ].map((at) => sky(at) - 1),
                0
            );
            return { level: 0, sky: through };
        },
        biome: (dimension, { x, y, z }) => {
            const chunk = worldOf(dimension)?.getLoadedChunk(x >> 4, z >> 4);
            if (chunk === null || chunk === undefined) return undefined;
            const biome = bedrockBiomeToJava(chunk.getBiome(x, y, z));
            return biome.kind === 'unknown' ? undefined : biome.bedrock.identifier;
        },
        biomes: () => {
            const content = server.getContent();
            if (biomes?.content !== content) {
                const tags = parseBiomeTags(content.biomes);
                biomes = { content, list: [...tags].map(([id, list]) => ({ id, tags: list })) };
            }
            return biomes.list;
        },
        findBiome: (dimension, biome, from) => {
            const found = worldOf(dimension)?.locateBiome(biome, from);
            return found === undefined ? undefined : { x: found.x, y: found.y, z: found.z };
        },
        entityBox: (id) => {
            if (!/^\d+$/.test(id)) return undefined;
            for (const world of level.worlds()) {
                const actor = world.getActor(BigInt(id));
                if (actor === null) continue;
                const { width, height } = actor.getBox();
                const at = actor.getPosition();
                const feet = actor.getFeetY();
                return {
                    min: { x: at.getX() - width / 2, y: feet, z: at.getZ() - width / 2 },
                    max: { x: at.getX() + width / 2, y: feet + height, z: at.getZ() + width / 2 }
                };
            }
            return undefined;
        },
        spawnItem: (dimension, item, { x, y, z }) => {
            const made = itemFromContent(item.typeId, server.getContent())
                ?.withCount(item.amount)
                .withDisplay(item.nameTag, item.lore ?? []);
            const stack = made === undefined || made === null ? null : storedItem(made);
            if (stack === null) return undefined;
            const entity = worldOf(dimension)?.dataEntities().dropItem({ x, y, z }, { stack });
            return entity === undefined ? undefined : String(entity.id);
        },
        // BDS drops the whole payout as one orb, where a mob's death splits it into Java's sizes.
        spawnXp: (dimension, { x, y, z }, amount) =>
            void worldOf(dimension)
                ?.dataEntities()
                .runtime.spawn('minecraft:xp_orb', { x, y, z }, { data: { value: amount } }),
        explode: (dimension, { x, y, z }, { radius, breaksBlocks, source }) => {
            const world = worldOf(dimension);
            if (world === undefined) return;
            const actor = source === undefined || !/^\d+$/.test(source) ? null : world.getActor(BigInt(source));
            // Fire and an explosion under water are not modelled by the blast this shares with TNT.
            explode(world, new Vector3(x, y, z), { power: radius, breaksBlocks, source: actor });
        },
        // JSPrismarine runs Java's features, not the Bedrock features a pack names, so a feature
        // the packs define is found and not placed.
        placeFeature: (_dimension, name, _location, rule) => {
            const content = server.getContent();
            return (rule ? content.featureRules : content.features).get(name) === undefined ? 'unknown' : false;
        },
        generatedStructures: (dimension, { x, y, z }) => {
            const world = worldOf(dimension);
            const generator = world?.getGenerator();
            if (world === undefined || generator === undefined || !hasStructureStarts(generator)) return [];
            const found = new Set<string>();
            const seed = world.getSeed();
            for (let dx = -STRUCTURE_REACH; dx <= STRUCTURE_REACH; dx++) {
                for (let dz = -STRUCTURE_REACH; dz <= STRUCTURE_REACH; dz++) {
                    for (const start of generator.structureStartsAt((x >> 4) + dx, (z >> 4) + dz, seed)) {
                        const box = start.boundingBox;
                        const inside =
                            x >= box.minX &&
                            x <= box.maxX &&
                            y >= box.minY &&
                            y <= box.maxY &&
                            z >= box.minZ &&
                            z <= box.maxZ;
                        const name = start.structure.replace(/^minecraft:/, '');
                        const feature = FEATURE_TYPES.find(([prefix]) => name.startsWith(prefix))?.[1];
                        if (inside && feature !== undefined) found.add(feature);
                    }
                }
            }
            return [...found];
        },
        tickingAreas: () => {
            const areas = level.getTickingAreas();
            return areas.list('script').map((area) => ({
                identifier: area.name,
                dimension: area.dimension,
                chunks: area.chunks,
                loaded: areas.isLoaded(area)
            }));
        },
        addTickingArea: (identifier, dimension, chunks) =>
            void level.getTickingAreas().add({ name: identifier, owner: 'script', dimension, chunks }),
        removeTickingArea: (identifier) => level.getTickingAreas().remove('script', identifier),
        lootTable: (path) => {
            const data = server.getContent().definitions.lootTables.get(path)?.data;
            return data === undefined ? undefined : withCurrentItemNames(data);
        },
        rollLootTable: (path, tool) => {
            const content = server.getContent();
            if (content.definitions.lootTables.get(path) === undefined) return undefined;
            const stack = tool === undefined ? undefined : itemFromContent(tool.typeId, content)?.asPredicateStack();
            // The server rolls the Java table a Bedrock path maps to, as its mobs and chests do,
            // and a Bedrock table no Java one stands for from the pack itself.
            const java = javaLootIdOf(path);
            const rolled =
                java !== undefined && content.loot.table(java) !== undefined
                    ? content.loot.roll(java, { parameters: { tool: stack } })
                    : content.equipmentLoot.roll(path, { parameters: { tool: stack } });
            return scriptItems(bedrockItemDrops(rolled.filter((each) => each.count > 0).map(dropOfRolledStack)));
        },
        rollBlockLoot: (permutation, tool, place) => {
            const content = server.getContent();
            const held = tool === undefined ? null : itemFromContent(tool.typeId, content);
            const block = blockFromContent(permutation.typeId, content, permutation.states);
            if (block?.isCompatibleWithTool(held ?? null) === false) return undefined;
            const world = place === undefined ? overworld() : worldOf(place.dimension);
            return scriptItems(
                rollBlockDrops(
                    content,
                    { identifier: permutation.typeId, states: permutation.states },
                    {
                        ...(place === undefined ? {} : { position: place.location }),
                        ...(held === null || held === undefined ? {} : { tool: held.asPredicateStack() }),
                        ...(world === undefined ? {} : { level: lootLevelOf(world) })
                    }
                )
            );
        },
        rollEntityLoot: (typeId, _tool, place) => {
            const world = place === undefined ? overworld() : worldOf(place.dimension);
            return scriptItems(
                rollMobDrops(server.getContent(), typeId, {
                    ...(place === undefined ? {} : { position: place.location }),
                    ...(world === undefined ? {} : { level: lootLevelOf(world) })
                })
            );
        },
        fogStack: (player) =>
            sessions().some((session) => String(session.getRuntimeId()) === player)
                ? (fogs.get(player) ?? [])
                : undefined,
        setFogStack: (player, layers) => {
            fogs.set(player, layers);
            const session = sessions().find((each) => String(each.getRuntimeId()) === player);
            if (session === undefined) return;
            session.released(session.send(new PlayerFogPacket({ fogStack: layers.map((layer) => layer.fogId) })));
        },
        blockTags: (typeId) => blockFromContent(typeId, server.getContent())?.getTags() ?? [],
        clockPaused: () => level.isDayTimePaused(),
        setClockPaused: (paused) => level.setDayTimePaused(paused),
        timeMarkers: () => settings.timeMarkers,
        addTimeMarker: (marker) => void settings.timeMarkers.push(marker),
        removeTimeMarker: (name) => {
            const at = settings.timeMarkers.findIndex((marker) => marker.name === name);
            if (at >= 0) settings.timeMarkers.splice(at, 1);
        },
        stopSound: (dimension, sound) => {
            for (const session of sessions()) {
                if (session.getWorld().getDimension().bedrockName !== dimension) continue;
                const packet = new StopSoundPacket();
                packet.soundName = sound ?? '';
                packet.stopAllSounds = sound === undefined;
                session.released(session.send(packet));
            }
        }
    };
};
