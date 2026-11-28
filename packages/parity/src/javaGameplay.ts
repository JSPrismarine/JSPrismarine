import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { JAVA_GAME_RULES } from '@jsprismarine/commands/gamerules';
import { OPCODES } from '@jsprismarine/java-classfile/instructions';

import type { BehaviorAspect } from './behaviorScenarios.ts';
import { pinnedJavaClassFile } from './javaClassFile.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { scoreboardCriterionRows } from './scoreboardCriteriaScenarios.ts';

/**
 * The Java gameplay a player meets outside any one block, item or mob, as rows of the
 * `gameplay.mechanics` family: every game rule's effect, every mob effect, every enchantment's
 * effect, every damage type, every recipe and advancement, every scoreboard criterion, and the
 * player and world systems Java runs in code.
 *
 * The first four come from Java's own registries, so a Java release that adds an effect or a
 * damage type adds its row. The systems have no registry, so {@link JAVA_MECHANICS} lists them
 * with the Java class that runs each.
 */

/** A Java player or world system that no registry lists, and where Java runs it. */
export interface JavaMechanic {
    readonly id: string;
    /** What the system does in Java, for the tracker row. */
    readonly description: string;
}

/**
 * The player and world systems a player meets in Java that are not one block, item or mob, with
 * the Java code that runs each. Spawning, raids, the dragon fight and portals' block rules have
 * families of their own and are not repeated here.
 */
export const JAVA_MECHANICS: readonly JavaMechanic[] = [
    {
        id: 'hunger',
        description:
            'exhaustion from actions draining saturation, then food (FoodData.tick, Player.causeFoodExhaustion)'
    },
    { id: 'natural-regeneration', description: 'healing from a full or saturated food bar (FoodData.tick)' },
    { id: 'starvation', description: 'damage at an empty food bar, by difficulty (FoodData.tick)' },
    { id: 'eating', description: "a food's nutrition and saturation added to the bar (FoodData.eat)" },
    {
        id: 'experience-levels',
        description: 'the points each level needs and the levels points make (Player.getXpNeededForNextLevel)'
    },
    {
        id: 'experience-orbs',
        description: 'orbs merging, following and being picked up, and Mending repairing with them (ExperienceOrb)'
    },
    {
        id: 'death-drops',
        description:
            'a dead player dropping inventory and up to 7 points per level, unless keep_inventory (Player.dropAllDeathLoot)'
    },
    {
        id: 'respawn',
        description:
            'respawning at a bed, a respawn anchor or the world spawn (ServerPlayer.findRespawnPositionAndUseSpawnBlock)'
    },
    {
        id: 'sleeping',
        description:
            'sleeping in a bed skipping the night and the weather once enough players sleep (ServerLevel.tick, SleepStatus)'
    },
    {
        id: 'fall-damage',
        description: 'damage from a fall past the safe fall distance (LivingEntity.calculateFallDamage)'
    },
    { id: 'drowning', description: 'air running out under water and the damage after (LivingEntity.baseTick)' },
    {
        id: 'burning',
        description:
            'catching fire, burning damage, lava damage and putting a fire out (Entity.baseTick, Entity.lavaHurt)'
    },
    { id: 'freezing', description: 'freezing in powder snow and the damage after (LivingEntity.aiStep)' },
    { id: 'suffocation', description: 'damage inside a solid block (LivingEntity.baseTick)' },
    { id: 'void-damage', description: 'damage below the world (Entity.onBelowWorld)' },
    { id: 'armor', description: 'armor and toughness reducing damage (CombatRules.getDamageAfterAbsorb)' },
    { id: 'attack-cooldown', description: 'attack damage scaled by the attack strength recovered (Player.attack)' },
    { id: 'critical-hits', description: 'a falling attack dealing 1.5 times damage (Player.attack)' },
    { id: 'sweeping', description: "a sword's sweep hitting entities beside the target (Player.attack)" },
    { id: 'knockback', description: 'an attack or blast pushing an entity away (LivingEntity.knockback)' },
    {
        id: 'shield-blocking',
        description:
            'a raised shield blocking damage from the front and being disabled by an axe (LivingEntity.hurtServer)'
    },
    {
        id: 'totem',
        description: 'a totem of undying saving a player from death (LivingEntity.checkTotemDeathProtection)'
    },
    {
        id: 'elytra-flight',
        description: 'gliding with an elytra and boosting with a firework (LivingEntity.updateFallFlying)'
    },
    {
        id: 'item-entities',
        description: 'dropped items merging, despawning after 5 minutes and waiting before pickup (ItemEntity)'
    },
    {
        id: 'crafting',
        description: 'crafting in the 2 by 2 grid and on a crafting table (CraftingMenu, InventoryMenu)'
    },
    {
        id: 'smelting',
        description: 'furnaces, blast furnaces and smokers cooking with fuel (AbstractFurnaceBlockEntity.serverTick)'
    },
    {
        id: 'furnace-experience',
        description:
            'experience a furnace pays the player who takes its result, or pays out where it is broken (AbstractFurnaceBlockEntity.getRecipesToAwardAndPopExperience)'
    },
    {
        id: 'furnace-shift-click',
        description:
            'shift-clicking a stack the furnace can cook into its input slot (AbstractFurnaceMenu.quickMoveStack)'
    },
    { id: 'campfire-cooking', description: 'a campfire cooking up to four items (CampfireBlockEntity.cookTick)' },
    {
        id: 'brewing',
        description:
            'a brewing stand brewing potions with blaze powder fuel (BrewingStandBlockEntity.serverTick, PotionBrewing)'
    },
    { id: 'enchanting', description: "an enchanting table's three offers by bookshelves and seed (EnchantmentMenu)" },
    {
        id: 'anvil',
        description:
            'combining, repairing and renaming with level costs and prior work penalty (AnvilMenu.createResult)'
    },
    { id: 'grindstone', description: 'removing enchantments and refunding experience (GrindstoneMenu)' },
    { id: 'smithing', description: 'upgrading to netherite and applying armor trims (SmithingMenu)' },
    { id: 'stonecutting', description: 'cutting stone blocks into their shapes (StonecutterMenu)' },
    { id: 'loom', description: 'applying banner patterns (LoomMenu)' },
    { id: 'cartography', description: 'cloning, zooming and locking maps (CartographyTableMenu)' },
    { id: 'maps', description: 'a held map filling in the area around its holder (MapItem.update)' },
    {
        id: 'villager-trading',
        description: 'trading with a villager, demand-based prices, restocking and leveling up (MerchantMenu, Villager)'
    },
    { id: 'day-cycle', description: 'the time of day advancing and the moon phase it sets (ServerLevel.tickTime)' },
    {
        id: 'weather',
        description: 'rain and thunder starting and stopping on their timers (ServerLevel.advanceWeatherCycle)'
    },
    {
        id: 'lightning',
        description: 'lightning striking players and rods in a thunderstorm and what it hits (ServerLevel.tickThunder)'
    },
    {
        id: 'snow-and-ice',
        description: 'snow layering and water freezing in cold biomes while it snows (ServerLevel.tickPrecipitation)'
    },
    {
        id: 'insomnia',
        description: 'phantoms spawning over players who have not slept for three days (PhantomSpawner)'
    },
    { id: 'beacon', description: "a beacon's pyramid level, range and the effects it gives (BeaconBlockEntity.tick)" },
    {
        id: 'conduit',
        description: "a conduit's frame, its Conduit Power and its attack on hostile mobs (ConduitBlockEntity)"
    },
    {
        id: 'difficulty',
        description:
            'difficulty scaling mob damage, hunger damage and regional difficulty (Difficulty, DifficultyInstance)'
    },
    {
        id: 'game-modes',
        description: 'what survival, creative, adventure and spectator let a player do (GameType, Abilities)'
    },
    {
        id: 'nether-travel',
        description:
            'a nether portal taking a player between dimensions at 8 to 1 and building a portal (NetherPortalBlock, PortalForcer)'
    },
    {
        id: 'end-travel',
        description:
            'an end portal, the exit portal and end gateways moving a player (EndPortalBlock, TheEndGatewayBlockEntity)'
    },
    {
        id: 'fishing',
        description:
            'casting a rod, the wait, the bite, reeling in, and the fish, junk and treasure tables (FishingHook)'
    },
    {
        id: 'explosions',
        description: 'a blast breaking blocks, dropping them with decay, hurting and pushing entities (ServerExplosion)'
    },
    {
        id: 'lighting',
        description: 'block and sky light spreading and dimming through blocks (LightEngine)'
    },
    {
        id: 'random-ticks',
        description: 'random_tick_speed blocks of each loaded section ticking each tick (ServerLevel.tickChunk)'
    },
    {
        id: 'mob-griefing',
        description:
            'the mobs whose blocks the mob_griefing rule stops: creepers, endermen, ravagers, villagers farming (ServerLevel.getGameRules)'
    },
    { id: 'statistics', description: 'counting what a player does into their statistics (ServerStatsCounter)' },
    { id: 'advancements', description: 'granting an advancement when its criteria trigger (PlayerAdvancements)' },
    { id: 'recipe-book', description: 'unlocking recipes as a player gets their ingredients (ServerRecipeBook)' }
];

let mobEffects: readonly string[] | undefined;

/**
 * Java's mob effect ids, from `MobEffects.<clinit>`, which registers each effect with its id as
 * the first string constant before the field it stores it in. The other constants it loads are
 * translation keys and attribute modifier ids, which hold a dot or a namespace.
 */
export const javaMobEffects = (): readonly string[] => {
    if (mobEffects !== undefined) return mobEffects;
    const init = pinnedJavaClassFile('net/minecraft/world/effect/MobEffects')?.methods.find(
        (method) => method.name === '<clinit>'
    );
    const ids: string[] = [];
    let pending: string | undefined;
    for (const instruction of init?.instructions ?? []) {
        const constant = instruction.constant;
        if (typeof constant === 'string' && pending === undefined && /^[a-z_]+$/.test(constant)) pending = constant;
        if (instruction.opcode === OPCODES.PUTSTATIC && pending !== undefined) {
            ids.push(`minecraft:${pending}`);
            pending = undefined;
        }
    }
    mobEffects = ids;
    return ids;
};

/** The entries of one vanilla datapack registry directory, as namespaced ids. */
export const javaDatapackEntries = (registry: string): readonly string[] =>
    readdirSync(join(unpackVanillaDatapack(), 'data', 'minecraft', registry), { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.json'))
        .map((file) => `minecraft:${file.slice(0, -'.json'.length).split('\\').join('/')}`)
        .sort();

/**
 * Java's advancements, but the recipe unlocks under `recipes/`, which only grant a recipe in the
 * recipe book (the `recipe-book` mechanic) and show the player nothing of their own.
 */
const javaAdvancements = (): readonly string[] =>
    javaDatapackEntries('advancement').filter((id) => !id.startsWith('minecraft:recipes/'));

/** One gameplay row's identifier: the kind of Java gameplay, then its id, such as `mob_effect/minecraft:speed`. */
export const gameplayId = (
    kind:
        | 'game_rule'
        | 'mob_effect'
        | 'enchantment'
        | 'damage_type'
        | 'recipe'
        | 'advancement'
        | 'mechanic'
        | 'scoreboard_criterion',
    id: string
) => `${kind}/${id}`;

/** Every Java gameplay identifier the family accounts for, sorted within each kind. */
export const javaGameplayUniverse = (): readonly string[] => [
    ...JAVA_GAME_RULES.map((rule) => gameplayId('game_rule', rule.name)),
    ...javaMobEffects().map((id) => gameplayId('mob_effect', id)),
    ...javaDatapackEntries('enchantment').map((id) => gameplayId('enchantment', id)),
    ...javaDatapackEntries('damage_type').map((id) => gameplayId('damage_type', id)),
    ...javaDatapackEntries('recipe').map((id) => gameplayId('recipe', id)),
    ...javaAdvancements().map((id) => gameplayId('advancement', id)),
    ...JAVA_MECHANICS.map((mechanic) => gameplayId('mechanic', mechanic.id)),
    ...scoreboardCriterionRows().map((row) => gameplayId('scoreboard_criterion', row))
];

const mechanicDescriptions = new Map(JAVA_MECHANICS.map((mechanic) => [mechanic.id, mechanic.description]));

/**
 * The behaviors one gameplay identifier has that parity has to compare with Java. A game rule
 * has its registration, which the client sees, and its effect on play; each other identifier has
 * the one behavior its kind names.
 */
export const gameplayAspects = (identifier: string): readonly BehaviorAspect[] => {
    // The id after the kind may hold slashes of its own, as an advancement's does.
    const slash = identifier.indexOf('/');
    const kind = identifier.slice(0, slash);
    const id = identifier.slice(slash + 1);
    switch (kind) {
        case 'game_rule':
            return [
                { id: 'registered', description: 'the server registers the rule under its Bedrock name' },
                { id: 'effect', description: 'what changing the rule does to play, against Java' }
            ];
        case 'mob_effect':
            return [
                {
                    id: 'effect',
                    description: 'what the effect does to an entity that has it, by amplifier, against Java'
                }
            ];
        case 'advancement':
            return [
                {
                    id: 'granted',
                    description: 'granted, with its toast and its reward, when its criteria are met, against Java'
                }
            ];
        case 'enchantment':
            return [
                { id: 'effect', description: "what the enchantment's effect components do at each level, against Java" }
            ];
        case 'recipe':
            return [
                {
                    id: 'crafts',
                    description: "making it at its station: whether a player can, and whether it gives Java's result"
                }
            ];
        case 'scoreboard_criterion':
            return [
                { id: 'raised', description: 'what raises a player’s score of an objective counting it, against Java' }
            ];
        case 'damage_type':
            return [
                {
                    id: 'damage',
                    description: 'how damage of this type is scaled, blocked, bypassed and reported, against Java'
                }
            ];
        default:
            return [{ id: 'behavior', description: `${mechanicDescriptions.get(id) ?? id}, against Java` }];
    }
};
