/**
 * The composition root: every content registry the server runs on, built
 * once from one pack stack.
 *
 * Twenty packages each own one domain and none of them knows the others
 * exist. This module is the only place that does. It loads the stack,
 * registers the vanilla behavior families against the world adapter,
 * resolves each domain's definitions into types, and flattens the hot
 * per-state columns, in the one order those steps allow.
 */
import { AdvancementEngine, parseAdvancement } from '@jsprismarine/advancements';
import { item_tags, java_entity_attributes, java_entity_navigation } from '@jsprismarine/bedrock-data';
import { registerVanillaBlockBehaviors } from '@jsprismarine/block-behaviors';
import type { BlockHooks } from '@jsprismarine/blocks';
import type { BlockPalette, BlockState, BlockTable, BlockType } from '@jsprismarine/blocks';
import { flattenBlockStates, resolveBlocks, vanillaBlockPalette } from '@jsprismarine/blocks';
import { BehaviorRegistry, Registry } from '@jsprismarine/content';
import type { Diagnostic } from '@jsprismarine/content';
import { EnchantmentRegistry, createEnchantmentView, parseEnchantment } from '@jsprismarine/enchantments';
import { EntityTypes } from '@jsprismarine/entities';
import type { EntityType, JavaNavigationSource, JavaStatSource } from '@jsprismarine/entities';
import { BrainMobRegistry, registerBrainMobs } from '@jsprismarine/entity-brains';
import { createGoalEntityRegistry } from '@jsprismarine/entity-goals';
import type { EntityComponentRegistry } from '@jsprismarine/entities';
import { deferredItemFactory, registerVanillaItemBehaviors } from '@jsprismarine/item-behaviors';
import type { ItemFacts, ItemHooks, ItemRegistry, ItemType } from '@jsprismarine/items';
import type { BedrockItemTags } from '@jsprismarine/items';
import { flattenItemFacts, loadItemTypes, maxDamage, maxStackSize, vanillaItemDefinitions } from '@jsprismarine/items';
import { defaultItemStackOps } from '@jsprismarine/predicates';
import type { ItemStackOps, ReferenceResolver } from '@jsprismarine/predicates';
import { LootRegistry, bedrockLootTables, javaLootTables } from '@jsprismarine/loot';
import { createPackIdentifierResolver } from '@jsprismarine/mapping';
import { load as loadPacks } from '@jsprismarine/packs';
import type { Definition, Definitions, IdentifierResolver } from '@jsprismarine/packs';
import { loadRecipes } from '@jsprismarine/recipes';
import type { RecipeBook } from '@jsprismarine/recipes';
import { parseSpawnRule } from '@jsprismarine/spawning';
import type { SpawnRule } from '@jsprismarine/spawning';
import { parseTradeTable } from '@jsprismarine/trading';
import type { TradeTable } from '@jsprismarine/trading';

import type { ContentOptions } from './ContentOptions';
import { resolvePackStack } from './packStack';
import { buildContentTags } from './tags';
import type { ContentTags } from './tags';
import { checkIdentifiers } from './unmappedIdentifiers';
import { advancementRewards } from '../advancement/rewards';
import { unwiredWorldSource } from './world/unwired';
import { contentWorldViews } from './world/views';
import type { ContentWorldViews } from './world/views';

/** The resolved block domain. */
export interface ServerContentBlocks {
    /** The dense runtime id per state, which indexes {@link ServerContentBlocks.table}. */
    readonly palette: BlockPalette;
    /** One resolved type per block identifier. */
    readonly types: ReadonlyMap<string, BlockType>;
    /** One entry per palette state, in runtime id order. */
    readonly states: readonly BlockState[];
    /** The flattened hot columns, each a typed array indexed by runtime id. */
    readonly table: BlockTable;
    /** The 49 vanilla behavior families, plus whatever a plugin added before the build. */
    readonly behaviors: BehaviorRegistry<BlockHooks>;
}

/** The resolved item domain. */
export interface ServerContentItems {
    /** The registry, with a dense id per item identifier. */
    readonly registry: ItemRegistry;
    /** One resolved type per item identifier. */
    readonly types: ReadonlyMap<string, ItemType>;
    /** Bedrock tags from the captured catalog and loaded item definitions. */
    readonly tags: BedrockItemTags;
    /** The flattened hot columns, each a typed array indexed by the registry id. */
    readonly facts: ItemFacts;
    /** The 47 vanilla behavior families. */
    readonly behaviors: BehaviorRegistry<ItemHooks>;
}

/** The resolved entity domain. */
export interface ServerContentEntities {
    /** The registry, with a dense id per entity identifier. */
    readonly registry: Registry<EntityType>;
    /** The loaded types, which also spawn instances. */
    readonly types: EntityTypes;
    /** The component registry, with all 170 goals registered ahead of the reference components. */
    readonly components: EntityComponentRegistry;
    /** The twenty Java brain mobs, whose behavior has no data form in either edition. */
    readonly brains: BrainMobRegistry;
    /** Java's attribute suppliers for the stats the server decides. */
    readonly javaStats?: JavaStatSource;
    /** Java's navigation classes, path costs, and pushability for each mob. */
    readonly javaNavigation?: JavaNavigationSource;
}

/**
 * Every content registry the server runs on.
 *
 * Built once at startup and replaced whole by a reload. Hold a key or a
 * `Holder`, never a numeric id: ids are positional and a rebuild renumbers
 * them from zero.
 */
export interface ServerContent {
    /** The composed pack stack, before any domain resolved it. */
    readonly definitions: Definitions;
    /** Everything the load and every resolve reported, in build order. */
    readonly diagnostics: readonly Diagnostic[];
    /** The nine world interfaces the content packages were built against. */
    readonly world: ContentWorldViews;
    readonly blocks: ServerContentBlocks;
    readonly items: ServerContentItems;
    readonly entities: ServerContentEntities;
    /** Java's recipe grammar, with net ids assigned in registry order. */
    readonly recipes: RecipeBook;
    /** Java's loot tables, compiled on first roll. */
    readonly loot: LootRegistry;
    /**
     * Bedrock's loot tables, compiled on first roll, which is what a mob
     * spawns holding: `minecraft:equipment.table` names one of these.
     *
     * Separate from {@link ServerContent.loot} because a registry reads one
     * dialect, and these are the behavior pack's own files rather than a
     * datapack's.
     */
    readonly equipmentLoot: LootRegistry;
    /** Java's advancements, with their trigger graph built. */
    readonly advancements: AdvancementEngine;
    /** Java's enchantments and their effect components. */
    readonly enchantments: EnchantmentRegistry;
    /** Bedrock's spawn rules, one per parsed `spawn_rules/` file. */
    readonly spawnRules: readonly SpawnRule[];
    /** Bedrock's trade tables, keyed by the pack-relative path a villager names. */
    readonly tradeTables: ReadonlyMap<string, TradeTable>;
    /** Bedrock's biome definitions, unparsed, keyed by identifier. */
    readonly biomes: Registry<Definition>;
    /** Bedrock's feature definitions, unparsed, keyed by identifier. */
    readonly features: Registry<Definition>;
    /** Bedrock's feature rules, unparsed, keyed by identifier. */
    readonly featureRules: Registry<Definition>;
    /**
     * Structure definitions, unparsed.
     *
     * Empty for now: the templates are NBT rather than JSON and
     * `@jsprismarine/packs` routes no structure registry yet, so the world
     * subsystem reads them itself. The registry is declared so the seam does
     * not move once it does.
     */
    readonly structures: Registry<Definition>;
    /** Every tag file in the stack, merged by Java Edition's rule and split by tagged registry. */
    readonly tags: ContentTags;
}

/**
 * Compiles every table a loot registry holds and restates what it reported in
 * the shared report shape.
 *
 * `@jsprismarine/loot` reports against a table id and a field path, the way
 * `@jsprismarine/recipes` does, so the pack and the file on disk are looked up
 * here from the registry the tables were loaded into.
 *
 * Nothing here is an error for the vanilla stack: over 1447 Java tables it
 * reports nothing at all, and over 309 Bedrock tables it reports 1484 reviewed
 * gaps, each naming what a roll comes out without. An error means a pack
 * carries grammar nobody has reviewed, which is what `content-strict` refuses.
 *
 * @param registry - The registry to drain. It is validated here, so a strict
 *   one throws rather than returning.
 * @param files - The loader's records for those tables, for the pack and path.
 * @throws {import('@jsprismarine/loot').LootGrammarError} In strict mode, when a table reported an error.
 */
const lootDiagnostics = (registry: LootRegistry, files: ReadonlyMap<string, Definition>): readonly Diagnostic[] => {
    registry.validate();

    return registry.findings.map((finding) => ({
        severity: finding.severity,
        code: finding.severity === 'error' ? 'loot.invalid' : 'loot.unapplied',
        pack: files.get(finding.id)?.pack ?? registry.dialect,
        path: files.get(finding.id)?.path,
        message: `${finding.path}: ${finding.message}`
    }));
};

/** Builds a `Registry<Definition>` straight from one of the loaded registries. */
const registryOf = (name: string, definitions: ReadonlyMap<string, Definition>): Registry<Definition> => {
    const registry = new Registry<Definition>(name);
    registry.rebuild(definitions);
    return registry;
};

/**
 * Builds every content registry from a pack stack.
 *
 * The order is forced by what each step needs. The behavior families are
 * registered before their domain resolves, because resolution attaches them;
 * the item factory is deferred and bound afterwards, because the families
 * are registered before the item registry they build stacks from exists; and
 * the goals are registered before the reference entity components, because
 * the component registration skips names that are already taken and the
 * goals are the implementations the server wants.
 *
 * @throws {import('@jsprismarine/packs').PackLoadError} In strict mode, when
 *   the pack stack reports an error.
 * @throws {import('./unmappedIdentifiers').UnmappedIdentifierError} In strict
 *   mode, when a Java identifier the stack references has no Bedrock mapping
 *   and no reviewed loss entry.
 * @throws {import('@jsprismarine/blocks').BlockLoadError} In strict mode,
 *   when a block definition does not resolve.
 * @throws {import('@jsprismarine/loot').LootGrammarError} In strict mode, when
 *   a loot table carries grammar this server has no reviewed entry for.
 */
export const buildServerContent = (options: ContentOptions = {}): ServerContent => {
    const strict = options.strict ?? false;
    const diagnostics: Diagnostic[] = [];

    const resolved = options.stack ? { stack: options.stack, diagnostics: [] } : resolvePackStack(options.packs);
    diagnostics.push(...resolved.diagnostics);

    const loaded = (options.load ?? loadPacks)(resolved.stack, { strict });
    diagnostics.push(...loaded.diagnostics);
    const definitions = loaded.definitions;

    // Plan section 5's rule: a Java identifier with no Bedrock mapping and no
    // reviewed loss stops a strict build here, before any domain resolves
    // around the hole it would leave.
    const identifierResolver = options.identifiers ?? createPackIdentifierResolver();
    diagnostics.push(...checkIdentifiers(definitions, { strict, resolver: identifierResolver }));

    // The world views read the built content, and the behavior families read the world, so the
    // two are tied together before either exists. `built` closes the loop: nothing dereferences
    // it until a hook runs, which is after this function has returned.
    let built: ServerContent | undefined;
    const world = contentWorldViews(options.world ?? unwiredWorldSource({ seed: options.seed }), () => {
        if (!built) throw new Error('the content world was read before the content finished building');
        return built;
    });

    const blockBehaviors = new BehaviorRegistry<BlockHooks>();
    registerVanillaBlockBehaviors(blockBehaviors, world.blockWorld);
    const blocks = resolveBlocks(definitions.blocks.values(), {
        behaviors: blockBehaviors,
        statePalette: options.blockPalette ?? vanillaBlockPalette(),
        strict
    });
    diagnostics.push(...blocks.diagnostics);

    const itemBehaviors = new BehaviorRegistry<ItemHooks>();
    const itemFactory = deferredItemFactory();
    registerVanillaItemBehaviors(itemBehaviors, { world: world.itemActions, items: itemFactory });
    const items = loadItemTypes({
        behaviors: itemBehaviors,
        definitions: options.itemDefinitions ?? vanillaItemDefinitions(),
        bedrockDefinitions: definitions.items.values(),
        bedrockTags: item_tags,
        strict
    });
    itemFactory.bind(items.registry);
    diagnostics.push(...items.diagnostics);

    const entityComponents = createGoalEntityRegistry({ world: (entity) => world.goalWorld(entity) });
    const entityTypes = new EntityTypes({ components: entityComponents });
    diagnostics.push(
        ...entityTypes.load(
            [...definitions.entities.values()].map((definition) => ({
                pack: definition.pack,
                path: definition.path,
                data: definition.data
            }))
        )
    );

    const brains = new BrainMobRegistry();
    registerBrainMobs(brains);

    const tags = buildContentTags(definitions.tags, (registry, identifier) =>
        isKnownTagMember(registry, identifier, definitions, identifierResolver, blocks.types, items.types, entityTypes)
    );
    diagnostics.push(...tags.diagnostics);

    // The loader wraps each file in a record carrying its pack and path; the recipe grammar
    // reads the file itself. Tags go in because without them every `#tag` ingredient parses
    // as accepting nothing.
    const recipes = loadRecipes(
        [...definitions.recipesJava].map(([id, definition]) => [id, definition.data] as const),
        { tags: (registry, tag) => (tags.has(registry, tag) ? tags.members(registry, tag) : undefined) }
    );
    // `@jsprismarine/recipes` reports against the recipe id and a field path rather than
    // against a pack and a file, so its findings are restated in the shared report shape.
    for (const entry of recipes.diagnostics) {
        diagnostics.push({
            severity: entry.severity,
            code: 'recipe.invalid',
            pack: definitions.recipesJava.get(entry.recipeId)?.pack ?? entry.recipeId,
            path: definitions.recipesJava.get(entry.recipeId)?.path,
            message: `${entry.recipeId} ${entry.path}: ${entry.message}`
        });
    }

    // What lets a `#tag` inside a criterion or a `supported_items` expand.
    // Without it `#minecraft:stone_tool_materials` in `story/mine_stone`
    // matches nothing, which is most of the advancement corpus: nearly every
    // item predicate in it names a tag rather than an item.
    const resolver = contentResolver(definitions, tags);

    const enchantments = new EnchantmentRegistry({
        definitions: parseEnchantments(definitions.enchantments, resolver, diagnostics),
        tags: enchantmentTagsFor(tags),
        items: { tagsOf: itemTagIndex(tags) }
    });

    // The three seams a loot table reaches that no pack states. Without the
    // enchantment view `enchant_randomly` and `enchant_with_levels` report and
    // leave the stack bare across 25 vanilla tables, and without the item
    // limits a rolled count clamps to 64 whatever the item is. `structures`
    // stays out: an `exploration_map` needs a structure search, and this
    // server has none to offer yet, so the modifier reports rather than
    // pointing a map at a made-up place.
    const loot = new LootRegistry(
        { ...definitions, lootTables: javaLootTables(definitions.lootTablesJava) },
        {
            worldSeed: options.seed ?? 0n,
            enchantments: (random) => createEnchantmentView(enchantments, { random }),
            items: itemStackOpsFor(items.types),
            strict
        }
    );

    // The same evaluator over the behavior pack's own tables, which is what a
    // mob spawns holding. Two registries rather than one because a registry
    // reads one dialect, and which dialect is a member of the source rather
    // than a word sitting beside it: `javaLootTables` over this map is the
    // mistake that armed 2000 zombies of 2000, and it no longer compiles.
    const equipmentLoot = new LootRegistry(
        { ...definitions, lootTables: bedrockLootTables(definitions.lootTables) },
        { worldSeed: options.seed ?? 0n, items: itemStackOpsFor(items.types), strict }
    );

    // Both registries compile every table here rather than at the first chest,
    // which is the only thing that makes `strict` mean anything for loot: a
    // table nobody rolls reports nothing, so a strict build that waits for a
    // roll refuses at a random later moment or never. Draining them is also
    // what puts the dialect's reviewed gaps in the content report.
    diagnostics.push(...lootDiagnostics(loot, definitions.lootTablesJava));
    diagnostics.push(...lootDiagnostics(equipmentLoot, definitions.lootTables));

    // The engine evaluates loot conditions, so it needs the same views a loot
    // roll does. Without `items` the `count` of an item predicate and the slot
    // counts of `inventory_changed` report instead of answering; without
    // `enchantments` an `enchantments` item predicate does. The reward hooks
    // are bound in `src/advancement/rewards.ts`, which is where a player can
    // be found again behind the `EntityView` the hook is handed.
    const advancements = new AdvancementEngine({
        items: itemStackOpsFor(items.types),
        enchantments: createEnchantmentView(enchantments),
        rewards: advancementRewards()
    });
    advancements.load(parseAdvancements(definitions.advancements, resolver, diagnostics));

    const content: ServerContent = {
        definitions,
        diagnostics,
        world,
        blocks: {
            palette: blocks.palette,
            types: blocks.types,
            states: blocks.states,
            table: flattenBlockStates(blocks),
            behaviors: blockBehaviors
        },
        items: {
            registry: items.registry,
            types: items.types,
            tags: items.bedrockTags,
            facts: flattenItemFacts(items.registry),
            behaviors: itemBehaviors
        },
        entities: {
            registry: entityTypes.registry,
            types: entityTypes,
            components: entityComponents,
            brains,
            javaStats: java_entity_attributes,
            javaNavigation: java_entity_navigation
        },
        recipes: recipes.book,
        loot,
        equipmentLoot,
        advancements,
        enchantments,
        spawnRules: parseSpawnRules(definitions.spawnRules, diagnostics),
        tradeTables: parseTradeTables(definitions.tradeTables, diagnostics),
        biomes: registryOf('biomes', definitions.biomes),
        features: registryOf('features', definitions.features),
        featureRules: registryOf('feature_rules', definitions.featureRules),
        structures: registryOf('structures', new Map()),
        tags
    };

    built = content;
    return content;
};

/**
 * The predicate grammar's stack operations, answering the two per-item limits
 * out of the resolved item types instead of the package's 64-and-indestructible
 * defaults.
 *
 * `inventory_changed` counts full slots with `maxStackSize` and the anvil reads
 * `maxDamage`, so a default of 64 for an ender pearl and 0 for a pickaxe is the
 * difference between those answering and answering wrong.
 */
const itemStackOpsFor = (types: ReadonlyMap<string, ItemType>): ItemStackOps => ({
    ...defaultItemStackOps,
    maxStackSize: (stack) => types.get(stack.id)?.params(maxStackSize) ?? DEFAULT_MAX_STACK_SIZE,
    maxDamage: (stack) => types.get(stack.id)?.params(maxDamage) ?? 0
});

/** What an item that names no `minecraft:max_stack_size` stacks to, which is Java's default. */
const DEFAULT_MAX_STACK_SIZE = 64;

/**
 * The reference resolver the Java grammars parse against.
 *
 * Elements come straight out of the loaded registries, and tags out of the
 * merged `ContentTags` rather than out of the raw files: the merge has already
 * applied Java Edition's cross-pack rule, so a tag two packs both add to
 * expands to both halves here and to one of them through the files.
 */
const contentResolver = (definitions: Definitions, tags: ContentTags): ReferenceResolver => {
    const elements: Readonly<Record<string, ReadonlyMap<string, Definition> | undefined>> = {
        loot_table: definitions.lootTablesJava,
        predicate: definitions.predicates,
        item_modifier: definitions.itemModifiers,
        recipe: definitions.recipesJava,
        advancement: definitions.advancements,
        enchantment: definitions.enchantments
    };

    return {
        element: (registry, id) => elements[registry]?.get(id)?.data,
        tag: (registry, id) => (tags.has(registry, id) ? tags.members(registry, id) : undefined)
    };
};

/** Parses every advancement file, reporting rather than throwing on a bad one. */
const parseAdvancements = (
    definitions: ReadonlyMap<string, Definition>,
    resolver: ReferenceResolver,
    diagnostics: Diagnostic[]
) => {
    const parsed = [];
    for (const [id, definition] of definitions) {
        const result = parseAdvancement(id, definition.data, { resolver });
        for (const entry of result.diagnostics) {
            diagnostics.push({
                severity: 'error',
                code: 'advancement.invalid',
                pack: definition.pack,
                path: definition.path,
                message: `${entry.path}: ${entry.message}`
            });
        }
        if (result.value) parsed.push(result.value);
    }
    return parsed;
};

/** Parses every enchantment file, reporting rather than throwing on a bad one. */
const parseEnchantments = (
    definitions: ReadonlyMap<string, Definition>,
    resolver: ReferenceResolver,
    diagnostics: Diagnostic[]
) => {
    const parsed = [];
    for (const [id, definition] of definitions) {
        const result = parseEnchantment(id, definition.data, { resolver });
        for (const entry of result.diagnostics) {
            diagnostics.push({
                severity: 'error',
                code: 'enchantment.invalid',
                pack: definition.pack,
                path: definition.path,
                message: `${entry.path}: ${entry.message}`
            });
        }
        parsed.push(result.value);
    }
    return parsed;
};

/**
 * The merged `enchantment` tags, which are what `EnchantmentRegistry.tags`
 * holds: `in_enchanting_table`, `treasure`, `curse` and the twelve others that
 * carry behavior no enchantment file states about itself.
 *
 * These used to be built from the `item` registry instead, which put every
 * item tag under a name no enchantment tag has. `membersOf` then found nothing
 * for `in_enchanting_table`, so an enchanting table drew from an empty pool.
 */
const enchantmentTagsFor = (tags: ContentTags): ReadonlyMap<string, readonly string[]> =>
    new Map(tags.tags('enchantment').map((tag) => [tag, tags.members('enchantment', tag)]));

/** Whether one loaded content domain or the Java registry census declares this tag member. */
const isKnownTagMember = (
    registry: string,
    identifier: string,
    definitions: Definitions,
    resolver: IdentifierResolver,
    blocks: ReadonlyMap<string, BlockType>,
    items: ReadonlyMap<string, ItemType>,
    entities: EntityTypes
): boolean => {
    const declared = (() => {
        switch (registry) {
            case 'block':
                return blocks.has(identifier);
            case 'item':
                return items.has(identifier);
            case 'entity_type':
                return entities.registry.has(identifier);
            case 'enchantment':
                return definitions.enchantments.has(identifier);
            case 'damage_type':
                return definitions.damageTypes.has(identifier);
            case 'worldgen/biome':
                return definitions.biomes.has(identifier);
            case 'loot_table':
                return definitions.lootTablesJava.has(identifier);
            case 'recipe':
                return definitions.recipesJava.has(identifier);
            case 'advancement':
                return definitions.advancements.has(identifier);
            case 'predicate':
                return definitions.predicates.has(identifier);
            case 'item_modifier':
                return definitions.itemModifiers.has(identifier);
            case 'function':
                return definitions.functions.has(identifier);
            default:
                return undefined;
        }
    })();
    if (declared === true) return true;
    if (declared === false && !identifier.startsWith('minecraft:')) return false;
    return resolver.resolve(registry, identifier) !== 'unknown';
};

/**
 * Item id to the `item` tags it carries, inverted once per content build.
 *
 * This is `ItemView.tagsOf`, the seam that decides whether an enchantment
 * supports a stack at all: every vanilla `supported_items` names a
 * `#minecraft:enchantable/...` tag rather than listing items, so without it
 * `registry.supports` answers false for all 43 enchantments.
 */
const itemTagIndex = (tags: ContentTags): ((itemId: string) => readonly string[]) => {
    let index: Map<string, string[]> | undefined;
    return (itemId) => {
        if (index === undefined) {
            index = new Map();
            for (const tag of tags.tags('item')) {
                for (const member of tags.members('item', tag)) {
                    const held = index.get(member);
                    if (held) held.push(tag);
                    else index.set(member, [tag]);
                }
            }
        }
        return index.get(itemId) ?? [];
    };
};

/** Parses every spawn rule file, reporting rather than throwing on a bad one. */
const parseSpawnRules = (definitions: ReadonlyMap<string, Definition>, diagnostics: Diagnostic[]): SpawnRule[] => {
    const rules: SpawnRule[] = [];
    for (const definition of definitions.values()) {
        const rule = parseSpawnRule(definition.data, {
            pack: definition.pack,
            path: definition.path,
            report: (diagnostic) => diagnostics.push(diagnostic)
        });
        if (rule) rules.push(rule);
    }
    return rules;
};

/** Parses every trade table, keyed by the pack-relative path a villager's component names. */
const parseTradeTables = (
    definitions: ReadonlyMap<string, Definition>,
    diagnostics: Diagnostic[]
): ReadonlyMap<string, TradeTable> => {
    const tables = new Map<string, TradeTable>();
    for (const [identifier, definition] of definitions) {
        const table = parseTradeTable(definition.data, {
            pack: definition.pack,
            path: definition.path,
            report: (diagnostic) => diagnostics.push(diagnostic)
        });
        if (table) tables.set(identifier, table);
    }
    return tables;
};
