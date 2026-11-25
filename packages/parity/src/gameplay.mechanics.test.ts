import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JAVA_GAME_RULES } from '@jsprismarine/commands/gamerules';
import type { Difficulty } from '@jsprismarine/engine-systems';
import { pointsForNextLevel } from '@jsprismarine/prismarine/entity/Experience';
import { effectHealthChange } from '@jsprismarine/prismarine/entity/StatusEffectTick';
import { PlayerComponents } from '@jsprismarine/prismarine/entity/playerComponents';
import { hungerOutcome } from '@jsprismarine/prismarine/entity/playerHunger';
import type { SurvivalPlayer } from '@jsprismarine/prismarine/entity/survivalPlayer';
import { buildNetworkContentPayloads } from '@jsprismarine/prismarine/editions/bedrock/contentPayloads';
import { GameRules } from '@jsprismarine/prismarine/world/GameRuleManager';
import { BlockRuntimeIds } from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import { Dimensions } from '@jsprismarine/prismarine/world/DimensionType';
import { lootLevelOf } from '@jsprismarine/prismarine/world/lootLevel';
import { MapCarriers } from '@jsprismarine/prismarine/world/mapCarriers';
import { updateMapAround } from '@jsprismarine/prismarine/world/mapRender';
import { mapTerrainOf } from '@jsprismarine/prismarine/world/mapTerrain';
import { MAP_SIZE, blankSavedMap } from '@jsprismarine/prismarine/world/savedMap';
import { STATION_BY_TYPE, recipeIngredients, recipeResult } from '@jsprismarine/recipes';
import type { Ingredient, Recipe, RecipeInput, RecipeItemStack } from '@jsprismarine/recipes';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, reportCoverage, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { gameplayAspects, gameplayId, javaDatapackEntries, javaGameplayUniverse } from './javaGameplay.ts';
import { experienceOrbScenarios } from './experienceOrbScenarios.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { isRecord } from './isRecord.ts';
import { realStack, serverContent } from './serverStack.ts';

/** One Java mechanic named by a Java registry entry. */
interface Mechanic {
    readonly id: string;
    /** Bedrock's lowercase name for a game rule, when it has one. */
    readonly bedrockName?: string;
}

const REGISTERED_RULES: ReadonlySet<string> = new Set(Object.values(GameRules).map((name) => name.toLowerCase()));

/** Java's profession ids, which the Bedrock trade table files spell without the underscore Java does. */
const JAVA_PROFESSIONS = [
    'armorer',
    'butcher',
    'cartographer',
    'cleric',
    'farmer',
    'fisherman',
    'fletcher',
    'leatherworker',
    'librarian',
    'mason',
    'shepherd',
    'toolsmith',
    'weaponsmith'
] as const;

const normalized = (name: string): string => name.replaceAll('_', '').toLowerCase();

const gameRuleScenario: BehaviorScenario<Mechanic> = {
    name: 'game-rule',
    java: "Every game rule in Java's registry is a rule the server runs, where Bedrock has one.",
    reference: 'Java 26.3 minecraft:game_rule registry and packages/commands/src/gamerules.ts',
    subjects: () =>
        JAVA_GAME_RULES.map((rule) => ({
            id: rule.name,
            ...(rule.bedrockName === undefined ? {} : { bedrockName: rule.bedrockName })
        })),
    idOf: (rule) => rule.id,
    covers: (rule) => gameplayId('game_rule', rule.id),
    aspects: () => ['registered'],
    classify: (rule) =>
        rule.bedrockName === undefined
            ? {
                  kind: 'intentional',
                  reason: 'Bedrock has no counterpart for this Java rule, so the client has no setting to show for it.'
              }
            : undefined,
    run: (rule) =>
        rule.bedrockName === undefined
            ? 'Bedrock has no counterpart rule'
            : REGISTERED_RULES.has(rule.bedrockName.toLowerCase())
              ? undefined
              : `Bedrock's ${rule.bedrockName} rule is not one the server registers`
};

const professionScenario: BehaviorScenario<Mechanic> = {
    name: 'villager-profession-trades',
    java: 'Every Java villager profession that trades has a trade table on the server.',
    reference: 'Java 26.3 minecraft:villager_profession registry; Bedrock trading/*_trades.json',
    subjects: () => JAVA_PROFESSIONS.map((id) => ({ id: `minecraft:${id}` })),
    idOf: (profession) => profession.id,
    covers: () => undefined,
    run: (profession) => {
        const wanted = normalized(profession.id.replace('minecraft:', ''));
        const tables = [...serverContent().definitions.tradeTables.keys()].map((path) =>
            normalized(path.replace(/^.*\//, '').replace(/_trades\.json$/, ''))
        );
        return tables.includes(wanted) ? undefined : `no trade table is named for the ${profession.id} profession`;
    }
};

/** Where the stand-in world's structure search finds every structure, far from {@link MAP_ORIGIN}. */
const FOUND_STRUCTURE = { x: 1200, y: 63, z: -880 };
const MAP_ORIGIN = { x: 8, y: 64, z: 8 };

/** The vanilla entries of one registry whose JSON runs `exploration_map`. */
const explorationMapEntries = (registry: 'loot_table' | 'villager_trade'): readonly string[] => {
    const root = join(unpackVanillaDatapack(), 'data', 'minecraft', registry);
    return javaDatapackEntries(registry).filter((id) =>
        readFileSync(join(root, `${id.slice('minecraft:'.length)}.json`), 'utf-8').includes('minecraft:exploration_map')
    );
};

/**
 * Why a stack is not the map Java's `ExplorationMapFunction` makes: a `map_id`, and a target
 * decoration where the search found the structure.
 */
const explorerMapDifference = (stack: { readonly components: ReadonlyMap<string, unknown> } | undefined) => {
    if (stack === undefined) return 'the map was discarded';
    if (!stack.components.has('minecraft:map_id')) return 'the map has no map_id';
    const decorations = stack.components.get('minecraft:map_decorations');
    const target = typeof decorations === 'object' && decorations !== null ? Object.values(decorations)[0] : undefined;
    return typeof target === 'object' && target !== null && 'x' in target && target.x === FOUND_STRUCTURE.x
        ? undefined
        : 'the map points at no structure the world found';
};

const explorationMapScenario: BehaviorScenario<{ readonly id: string }> = {
    name: 'exploration-map',
    java: "A loot table's or a trade's explorer map gets a map id and points at the nearest structure its destination names.",
    reference: 'Java 26.3 ExplorationMapFunction and ServerLevel.findNearestMapStructure',
    subjects: () => [
        ...explorationMapEntries('loot_table').map((id) => ({ id: `loot_table/${id}` })),
        ...explorationMapEntries('villager_trade').map((id) => ({ id: `villager_trade/${id}` }))
    ],
    idOf: (entry) => entry.id,
    covers: () => undefined,
    run: (entry) => {
        const content = serverContent();
        let lastMapId = -1;
        // The server's own level view over a world whose search always succeeds, so a row fails
        // only when the roll never asks the world or drops what it answered.
        const level = lootLevelOf({
            getTicks: () => 0,
            getDimension: () => ({ name: 'minecraft:overworld' }),
            locateStructure: () => FOUND_STRUCTURE,
            createMap: () => ++lastMapId
        });
        const [registry, id = ''] = entry.id.split('/minecraft:');

        if (registry === 'villager_trade') {
            const trade = content.definitions.villagerTrades.get(`minecraft:${id}`)?.data;
            const json = isRecord(trade) ? trade : {};
            const gives = json['gives'];
            const item =
                typeof gives === 'object' && gives !== null && 'id' in gives && typeof gives.id === 'string'
                    ? gives.id
                    : 'minecraft:map';
            const modifier = content.loot.itemModifier(json['given_item_modifier'], entry.id);
            const context = content.loot.context(undefined, {
                parameterSet: 'villager_trade',
                parameters: {
                    origin: MAP_ORIGIN,
                    this_entity: { type: 'minecraft:villager', position: MAP_ORIGIN },
                    additional_cost_component_allowed: true
                },
                level
            });
            return explorerMapDifference(modifier({ id: item, count: 1, components: new Map() }, context));
        }

        // A ruin or a camp rolls its map in one chest of several, so a row rolls until a map
        // comes out or a hundred chests have gone by.
        for (let attempt = 0; attempt < 100; attempt++) {
            const rolled = content.loot.roll(`minecraft:${id}`, {
                parameterSet: 'chest',
                parameters: { origin: MAP_ORIGIN },
                level
            });
            const map = rolled.find((stack) => stack.components.has('minecraft:map_decorations'));
            if (map !== undefined) return explorerMapDifference(map);
        }
        return 'no roll in a hundred produced a map';
    }
};

/**
 * A blank map held at (8.5, 8.5) for sixteen ticks over one loaded chunk of grass at y 64, as the
 * server's player tick drives it: its pixels and its markers afterwards.
 */
const heldMapOverGrass = () => {
    const chunk = new Chunk(0, 0);
    const grass = BlockRuntimeIds.getByName('minecraft:grass_block');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlockRuntimeId(x, 64, z, grass);
    const terrain = mapTerrainOf({
        getLoadedChunk: (chunkX, chunkZ) => (chunkX === 0 && chunkZ === 0 ? chunk : null),
        getDimension: () => Dimensions.Overworld
    });
    const map = blankSavedMap({ dimension: 'minecraft:overworld', x: 8, z: 8, scale: 0 });
    const carriers = new MapCarriers(map);
    const holder = {
        name: 'Steve',
        isRemoved: () => false,
        carries: () => true,
        dimension: () => 'minecraft:overworld',
        position: () => ({ x: 8.5, z: 8.5, yaw: 0, gameTime: 0 }),
        hidesFromMaps: () => false
    };
    for (let tick = 0; tick < 16; tick++) {
        carriers.tickCarriedBy(holder);
        updateMapAround(map, { x: 8.5, z: 8.5, step: carriers.nextStep(holder) }, terrain, carriers.paint);
    }
    return { colors: map.colors ?? new Uint8Array(), decorations: carriers.decorations() };
};

const mapScenario: BehaviorScenario<GameplaySubject> = {
    name: 'map-fills-in',
    java: 'A held map fills in over sixteen ticks from the loaded chunks around its holder, flat grass at normal brightness, leaves the rest blank, and draws the holder as an arrow at its position.',
    reference: 'Java 26.3 MapItem.update and MapItemSavedData.tickCarriedBy',
    subjects: () => [subject('mechanic', 'maps')],
    idOf: (entry) => entry.id,
    aspects: () => ['behavior'],
    run: () => {
        const { colors, decorations } = heldMapOverGrass();
        // The map is centered on the origin, so the loaded chunk is pixels 64 to 79.
        const at = (x: number, z: number) => colors[x + z * MAP_SIZE];
        // Java's packed id for grass at normal brightness: `MapColor.GRASS` is id 1 and
        // `Brightness.NORMAL` id 1, so `1 << 2 | 1`.
        const grass = 5;
        if (at(70, 70) !== grass) return `the holder's chunk is drawn as packed color ${at(70, 70)}, Java ${grass}`;
        if (at(30, 30) !== 0) return 'a pixel in a chunk that is not loaded is drawn';
        // Java's marker is in half pixels from the center: 8.5 blocks is 17.
        const marker = decorations[0];
        if (marker?.type !== 'minecraft:player' || marker.x !== 17 || marker.y !== 17) {
            return `the holder is marked ${JSON.stringify(marker)}, Java a minecraft:player at 17, 17`;
        }
        return undefined;
    }
};

/** One gameplay identifier a scenario compares, such as `mechanic/hunger`. */
interface GameplaySubject {
    readonly id: string;
}

const subject = (kind: Parameters<typeof gameplayId>[0], id: string): GameplaySubject => ({ id: gameplayId(kind, id) });

/** A player double over real components, at a health and a food bar a scenario sets. */
const playerAt = (health: number, food: number, saturation: number): SurvivalPlayer => {
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    components.set('vitals.food', food);
    components.set('vitals.saturation', saturation);
    return { components, vulnerable: () => true, alive: () => true, health: () => health, maxHealth: () => 20 };
};

/** Java's `Player.getXpNeededForNextLevel`. */
const javaPointsForNextLevel = (level: number): number =>
    level >= 30 ? 112 + (level - 30) * 9 : level >= 15 ? 37 + (level - 15) * 5 : 7 + level * 2;

/** Java's health-changing effects and what their `applyEffectTick` does at an amplifier on a tick it applies. */
const JAVA_HEALTH_EFFECTS: Readonly<
    Record<string, { readonly interval?: number; readonly change: (amplifier: number, health: number) => number }>
> = {
    // InstantenousMobEffect: heal(max(4 << amplifier, 0)) and hurt(6 << amplifier).
    'minecraft:instant_health': { change: (amplifier) => Math.max(4 << amplifier, 0) },
    'minecraft:instant_damage': { change: (amplifier) => -(6 << amplifier) },
    // RegenerationMobEffect heals 1 every 50 >> amplifier ticks while hurt.
    'minecraft:regeneration': { interval: 50, change: (_, health) => (health < 20 ? 1 : 0) },
    // PoisonMobEffect hurts 1 every 25 >> amplifier ticks while above 1 health.
    'minecraft:poison': { interval: 25, change: (_, health) => (health > 1 ? -1 : 0) },
    // WitherMobEffect hurts 1 every 40 >> amplifier ticks.
    'minecraft:wither': { interval: 40, change: () => -1 }
};

const javaDifficulties: readonly Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];

const playerScenarios: readonly BehaviorScenario<GameplaySubject>[] = [
    {
        name: 'experience-curve',
        java: 'A level costs 2L + 7 points up to level 15, 5L - 38 up to 30 and 9L - 158 after.',
        reference: 'Java Player.getXpNeededForNextLevel',
        subjects: () => [subject('mechanic', 'experience-levels')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            for (let level = 0; level <= 1000; level++) {
                const server = pointsForNextLevel(level);
                const java = javaPointsForNextLevel(level);
                if (server !== java) return `level ${level} costs ${server} points, Java ${java}`;
            }
            return undefined;
        }
    },
    {
        name: 'effect-health-tick',
        java: 'Instant health heals 4 << level, instant damage hurts 6 << level, and regeneration, poison and wither change health by 1 every 50, 25 and 40 ticks shifted right by the level.',
        reference:
            'Java InstantenousMobEffect, RegenerationMobEffect, PoisonMobEffect and WitherMobEffect applyEffectTick',
        subjects: () => Object.keys(JAVA_HEALTH_EFFECTS).map((id) => subject('mob_effect', id)),
        idOf: (entry) => entry.id,
        aspects: () => ['effect'],
        run: (entry) => {
            const id = entry.id.slice('mob_effect/'.length);
            const java = JAVA_HEALTH_EFFECTS[id];
            if (java === undefined) return 'no Java rule is recorded for this effect';
            for (let amplifier = 0; amplifier <= 4; amplifier++) {
                for (const health of [1, 10, 20]) {
                    for (let clock = 1; clock <= 100; clock++) {
                        const interval = java.interval === undefined ? 1 : java.interval >> amplifier;
                        const applies = interval <= 0 || clock % interval === 0;
                        const wanted = applies ? java.change(amplifier, health) : 0;
                        const change = effectHealthChange(id, amplifier, clock, health, 20);
                        const got = change === undefined ? 0 : change.kind === 'heal' ? change.amount : -change.amount;
                        if (got !== wanted) {
                            return `at level ${amplifier + 1}, health ${health} and tick ${clock} it changes health by ${got}, Java ${wanted}`;
                        }
                    }
                }
            }
            return undefined;
        }
    },
    {
        name: 'starvation-damage',
        java: 'An empty food bar hurts a player 1 every 80 ticks while above 10 health, or above 1 on Normal, or always on Hard.',
        reference: 'Java FoodData.tick',
        subjects: () => [subject('mechanic', 'starvation')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            for (const difficulty of javaDifficulties) {
                for (let health = 1; health <= 20; health++) {
                    const java = health > 10 || difficulty === 'hard' || (health > 1 && difficulty === 'normal');
                    const outcome = hungerOutcome(playerAt(health, 0, 0), 80, true, difficulty);
                    const server = outcome?.kind === 'starve';
                    if (server !== java) {
                        return `at ${health} health on ${difficulty} it ${server ? 'starves' : 'spares'} the player, Java ${java ? 'starves' : 'spares'}`;
                    }
                }
            }
            return undefined;
        }
    },
    {
        name: 'saturated-regeneration',
        java: 'A hurt player with a full food bar and saturation left heals min(saturation, 6) / 6 every 10 ticks, and otherwise 1 every 80 ticks at 18 food or more.',
        reference: 'Java FoodData.tick',
        subjects: () => [subject('mechanic', 'natural-regeneration')],
        idOf: (entry) => entry.id,
        aspects: () => ['behavior'],
        run: () => {
            let healed = 0;
            for (let tick = 1; tick <= 80; tick++) {
                const outcome = hungerOutcome(playerAt(10, 20, 5), tick, true, 'normal');
                if (outcome?.kind === 'regenerate') healed += outcome.amount;
            }
            // Eight heals of 5 / 6 in Java's 80 ticks.
            const java = 8 * (5 / 6);
            return Math.abs(healed - java) < 1e-6
                ? undefined
                : `it heals ${healed} in 80 ticks, Java ${java.toFixed(2)}`;
        }
    }
];

/** Bedrock cause names a blow carries, and the Java damage type each stands for. */
const HURT_CAUSES: readonly (readonly [cause: string, javaType: string])[] = [
    ['entity_attack', 'mob_attack'],
    ['projectile', 'arrow'],
    ['entity_explosion', 'explosion'],
    ['lava', 'lava'],
    ['fire', 'in_fire'],
    ['fire_tick', 'on_fire'],
    ['fall', 'fall'],
    ['drowning', 'drown'],
    ['magic', 'magic'],
    ['starve', 'starve']
];

/** A Java damage type's declared exhaustion, read from the vanilla datapack. */
const javaDamageExhaustion = (type: string): number => {
    const file = join(unpackVanillaDatapack(), 'data', 'minecraft', 'damage_type', `${type}.json`);
    // Parsed JSON boundary: a vanilla damage type file.
    const data = JSON.parse(readFileSync(file, 'utf-8')) as { readonly exhaustion?: number };
    return data.exhaustion ?? 0;
};

const hurtExhaustionScenario: BehaviorScenario<GameplaySubject> = {
    name: 'hurt-exhaustion',
    java: "A blow that takes a player's health costs the exhaustion its damage type declares: 0.1 for a blow, 0 for a fall, drowning, magic or starving.",
    reference: 'Java Player.actuallyHurt and DamageSource.getFoodExhaustion; data/minecraft/damage_type',
    subjects: () => [subject('mechanic', 'hunger')],
    idOf: (entry) => entry.id,
    aspects: () => ['behavior'],
    run: () => {
        const { runtime } = realStack();
        const player = runtime.spawn('minecraft:player', { x: 41_000.5, y: 64, z: 41_000.5 });
        if (player === undefined) return 'the server spawned no player';
        try {
            const components = runtime.playerSystems.componentsOf(player);
            for (const [cause, type] of HURT_CAUSES) {
                player.instance.attributes.set('health', 20);
                components.set('vitals.exhaustion', 0);
                runtime.damage({ target: player.id, cause, amount: 1, source: { route: 'command' } });
                const charged = components.get('vitals.exhaustion');
                const java = javaDamageExhaustion(type);
                if (Math.abs(charged - java) > 1e-6) {
                    return `a ${cause} blow costs ${charged} exhaustion, Java's ${type} ${java}`;
                }
            }
            return undefined;
        } finally {
            if (player.removed === undefined) runtime.remove(player.id, 'parity hurt exhaustion complete');
        }
    }
};

/** Java's `Player.hurtServer` scaling of a mob's blow, per difficulty. */
const JAVA_DIFFICULTY_SCALING: Readonly<Record<Difficulty, (amount: number) => number>> = {
    peaceful: () => 0,
    easy: (amount) => Math.min(amount / 2 + 1, amount),
    normal: (amount) => amount,
    hard: (amount) => (amount * 3) / 2
};

const difficultyScenario: BehaviorScenario<GameplaySubject> = {
    name: 'mob-blow-difficulty',
    java: "A mob's blow to a player is 0 on Peaceful, min(d / 2 + 1, d) on Easy, d on Normal and 1.5 d on Hard, unrounded.",
    reference:
        'Java Player.hurtServer and DamageSource.scalesWithDifficulty; data/minecraft/damage_type/mob_attack.json',
    subjects: () => [subject('mechanic', 'difficulty')],
    idOf: (entry) => entry.id,
    aspects: () => ['behavior'],
    run: () => {
        const { runtime, world } = realStack();
        const player = runtime.spawn('minecraft:player', { x: 42_000.5, y: 64, z: 42_000.5 });
        const zombie = runtime.spawn('minecraft:zombie', { x: 42_002.5, y: 64, z: 42_000.5 });
        const before = world.difficulty;
        try {
            if (player === undefined || zombie === undefined) return 'the server spawned no player or zombie';
            for (const difficulty of javaDifficulties) {
                world.difficulty = difficulty;
                for (const amount of [1, 3, 7]) {
                    player.instance.attributes.set('health', 20);
                    runtime.damage({
                        target: player.id,
                        attacker: zombie.id,
                        cause: 'entity_attack',
                        amount,
                        source: { route: 'command' }
                    });
                    const taken = 20 - (player.instance.attributes.get('health')?.current ?? 20);
                    const java = JAVA_DIFFICULTY_SCALING[difficulty](amount);
                    if (Math.abs(taken - java) > 1e-6) {
                        return `a zombie's ${amount} takes ${taken} on ${difficulty}, Java ${java}`;
                    }
                }
            }
            return undefined;
        } finally {
            world.difficulty = before;
            for (const entity of [player, zombie]) {
                if (entity !== undefined && entity.removed === undefined)
                    runtime.remove(entity.id, 'parity difficulty scenario complete');
            }
        }
    }
};

let advertised: ReadonlySet<string> | undefined;

/** The ids of the recipes the server advertises to a joining client, which are the ones a client can make. */
const advertisedRecipes = (): ReadonlySet<string> => {
    if (advertised !== undefined) return advertised;
    // Every id a crafting or smithing entry carries, with the Java recipes it stands for.
    const { recipesByNetId } = buildNetworkContentPayloads(serverContent());
    advertised = new Set([...recipesByNetId.values()].flat());
    return advertised;
};

/** One stack of an ingredient's first item, which any matcher must accept. */
const stackOf = (ingredient: Ingredient | null | undefined): RecipeItemStack | null => {
    const id = ingredient?.items[0];
    return id === undefined ? null : { id, count: 1 };
};

/** The input a player gives a recipe's station: its own ingredients, laid out as the recipe asks. */
const inputFor = (recipe: Recipe): RecipeInput | undefined => {
    const ingredients = recipeIngredients(recipe);
    switch (recipe.type) {
        case 'minecraft:crafting_shaped':
            return {
                station: 'crafting',
                grid: {
                    width: recipe.pattern.width,
                    height: recipe.pattern.height,
                    slots: recipe.pattern.cells.map(stackOf)
                }
            };
        case 'minecraft:crafting_shapeless':
            return {
                station: 'crafting',
                grid: { width: 3, height: 3, slots: Array.from({ length: 9 }, (_, slot) => stackOf(ingredients[slot])) }
            };
        case 'minecraft:smelting':
        case 'minecraft:blasting':
        case 'minecraft:smoking':
        case 'minecraft:campfire_cooking':
        case 'minecraft:stonecutting':
            return { station: STATION_BY_TYPE[recipe.type], item: stackOf(ingredients[0]) };
        case 'minecraft:smithing_transform':
            return {
                station: 'smithing',
                template: stackOf(ingredients[0]),
                base: stackOf(ingredients[1]),
                addition: stackOf(ingredients[2])
            };
        default:
            return undefined;
    }
};

/** The stations whose recipes a Bedrock client makes from the recipe list the server advertises. */
const ADVERTISED_STATIONS: ReadonlySet<string> = new Set(['crafting', 'stonecutting', 'smithing']);

const recipeScenario: BehaviorScenario<GameplaySubject> = {
    name: 'recipe-crafts',
    java: "A player makes each recipe at its station from the recipe's own ingredients and gets its result.",
    reference: 'Java 26.3 data/minecraft/recipe and RecipeManager.getRecipeFor',
    subjects: () => javaDatapackEntries('recipe').map((id) => subject('recipe', id)),
    idOf: (entry) => entry.id,
    aspects: () => ['crafts'],
    classify: () => ({
        kind: 'defect',
        reason: 'The server advertises no recipe of this kind to the client, so no player can make it.',
        reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3690'
    }),
    run: (entry) => {
        const id = entry.id.slice('recipe/'.length);
        const content = serverContent();
        const recipe = content.recipes.get(id);
        if (recipe === undefined) return 'the server loaded no such recipe';
        if (ADVERTISED_STATIONS.has(recipe.station) && !advertisedRecipes().has(id)) {
            return `the server does not advertise it to the client, so no player can make it (${recipe.type})`;
        }
        const input = inputFor(recipe);
        // A recipe whose result depends on what goes in, such as a firework star or a dyed
        // armor piece, has no input of its own to try; being advertised is all a row can check.
        if (input === undefined) return undefined;
        const wanted = recipeResult(recipe);
        const matches = content.recipes.matchAll(input);
        if (matches.length === 0) return 'its own ingredients match no recipe on the server';
        // A stonecutter offers every recipe its input matches; every other station makes the first.
        const made = recipe.station === 'stonecutting' ? matches : matches.slice(0, 1);
        const right = made.some(
            (match) =>
                match.recipe.id === id ||
                (match.result.id === wanted?.id && match.result.count === (wanted?.count ?? 1))
        );
        return right
            ? undefined
            : `its own ingredients make ${made.map((match) => `${match.result.count} ${match.result.id}`).join(' or ')}, Java ${wanted?.count ?? 1} ${wanted?.id ?? 'nothing'}`;
    }
};

describeFamily(
    FAMILIES.gameplayMechanics,
    [REFERENCES.javaWorldgenData, REFERENCES.bedrockBehaviorPack, REFERENCES.javaServerJar],
    () => {
        it('runs each Java game rule and villager profession on the server', { timeout: 180_000 }, () => {
            const rows = measureScenarios(
                FAMILIES.gameplayMechanics,
                import.meta.filename,
                scenarioGroup([gameRuleScenario]),
                scenarioGroup([professionScenario]),
                scenarioGroup(playerScenarios),
                scenarioGroup([recipeScenario]),
                scenarioGroup([explorationMapScenario]),
                scenarioGroup([mapScenario]),
                scenarioGroup([hurtExhaustionScenario]),
                scenarioGroup([difficultyScenario]),
                scenarioGroup(experienceOrbScenarios)
            );

            reportCoverage(
                FAMILIES.gameplayMechanics,
                import.meta.filename,
                javaGameplayUniverse(),
                rows,
                'No scenario compares this Java gameplay with the server.',
                gameplayAspects
            );

            expect(
                rows.some((row) => row.id === 'game-rule:minecraft:keep_inventory' && row.difference === undefined)
            ).toBe(true);
        });
    }
);
