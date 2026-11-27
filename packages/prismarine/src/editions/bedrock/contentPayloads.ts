/**
 * The four join payloads, built from the content registries instead of from
 * the server's own tables.
 *
 * A Bedrock client builds its world out of what the join burst tells it:
 * `StartGamePacket.Block Properties`, `ItemRegistryPacket`,
 * `CreativeContentPacket` and `CraftingDataPacket`. `@jsprismarine/protocol`
 * owns both their payload translation and their bytes. This module picks
 * which blocks and items the client has to be told about, calls the protocol
 * builders, and turns their results into the payload shapes the packets write.
 *
 * It is built once per `ServerContent` and protocol version. A content reload
 * replaces that object whole, so the cache is a `WeakMap` keyed on it and
 * nothing has to be invalidated by hand. The second key is the version because
 * the item numbering is version-specific: 1.26.60 moved 82 runtime ids, and the
 * creative entries and the brewing recipes carry item numbers rather than
 * names, so all three payloads move with the table.
 */
import {
    block_definitions,
    creative_groups,
    creativeitems,
    item_components,
    item_tags
} from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { javaBlockStateToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import { ItemInstanceUserData, NetworkBinaryStream, blockRuntimeId } from '@jsprismarine/protocol';
import { RecipeUnlockingContext } from '@jsprismarine/protocol/bedrock/packet/CraftingDataPacket';
import { compileRecipeBook } from '@jsprismarine/recipes';
import {
    assertBlockPaletteAgrees,
    buildBlockProperties,
    buildCraftingData,
    buildCreativeContent,
    buildItemRegistry,
    itemIdsOf,
    withPackMenuPlacements
} from '@jsprismarine/protocol/bedrock/payload';

import { canonicalItemData } from '../../network/codec/itemData';
import { isRecord } from '../../utils/isRecord';
import { blockTranslationFor } from '../../network/codec/blockTranslation';
import { assertContentPaletteAgrees } from './contentPalette';
import { mergeItemCatalogs } from './itemCatalog';

import type { ProtocolItemData } from '@jsprismarine/protocol';
import type { ServerContent } from '../../content/ServerContent';
import type { RecipeBookEntries } from './presenter/BedrockPresenter';
import type { BlockPalette, BlockType } from '@jsprismarine/blocks';
import type { ItemType } from '@jsprismarine/items';
import type { Logger } from '@jsprismarine/logger';
import type {
    BlockProperty,
    CraftingData,
    CreativeContent,
    ItemRegistryEntry,
    ItemStackData,
    MaterialReducer,
    PotionMix
} from '@jsprismarine/protocol';
import type {
    CreativeCatalog,
    ItemIdLookup,
    PackMenuPlacement,
    WireItemInstance,
    WireResult
} from '@jsprismarine/protocol/bedrock/payload';

/** The captured vanilla item components, parsed once from network NBT. */
const capturedItemComponents = Object.fromEntries(
    Object.entries(item_components).map(([identifier, data]) => [
        identifier,
        NBTTagCompound.readFromStream(new BinaryStream(data), ByteOrder.LITTLE_ENDIAN, true)
    ])
);

/** A stable key for an exact item set, independent of the order its tags declare. */
const itemSetKey = (items: readonly string[]): string => JSON.stringify([...new Set(items)].sort());

/** Vanilla Bedrock tags the client already knows, indexed by their exact members. */
const bedrockItemTagsByItems = new Map(Object.entries(item_tags).map(([tag, items]) => [itemSetKey(items), tag]));

/** What the server had to invent or could not say, so a startup line can report it. */
export interface ContentPayloadReport {
    /** How many blocks this server invented and had to define for the client. */
    readonly inventedBlocks: number;
    /** Items with no row in the captured table, which were given ids of this server's own. */
    readonly allocatedItemIds: readonly string[];
    /**
     * Declared blocks whose item form's number another item already has, so they have no item.
     * A client closes on the loading screen when it finds one of them.
     */
    readonly unnumberedBlocks: readonly string[];
    /** Block components no translation covers, as `block/component`. */
    readonly untranslatedComponents: readonly string[];
    /** Creative entries whose item the registry does not name, so they were dropped. */
    readonly unknownCreativeItems: readonly string[];
    /** Recipes with no Bedrock form, which the client is never told about. */
    readonly omittedRecipes: number;
    /** Ingredients narrowed to one item because the wire has room for one. */
    readonly widenedIngredients: number;
}

/** Everything the join burst sends that comes out of the content registries. */
export interface NetworkContentPayloads {
    /** `StartGamePacket.Block Properties`. */
    readonly blockProperties: readonly BlockProperty[];
    /** `ItemRegistryPacket.Item Data`. */
    readonly items: readonly ItemRegistryEntry[];
    readonly creative: CreativeContent;
    /**
     * The item behind each entry of {@link creative}, in the same order.
     *
     * A creative pick comes back as the entry's one-based position, and the
     * payload carries numbers rather than names, so this is what turns that
     * position back into the item the player clicked.
     */
    readonly creativeItems: readonly WireItemInstance[];
    readonly crafting: CraftingData;
    /**
     * The Java recipes behind each net id in {@link crafting}, which is how a craft the client
     * names by net id finds the recipe that answers it. A built-in or trim entry stands for
     * every Java recipe it covers, and a transmute goes out under several ids.
     */
    readonly recipesByNetId: ReadonlyMap<number, readonly string[]>;
    /**
     * The entries of {@link crafting} each Java recipe unlocks in the client's recipe book, by
     * Java recipe id. Only crafting table recipes are in the book; see {@link BOOK_UNLOCKING}.
     * A transmute is here under every entry it went out as.
     */
    readonly bookEntriesByRecipe: ReadonlyMap<string, readonly string[]>;
    readonly report: ContentPayloadReport;
}

/**
 * The creative catalog `@jsprismarine/bedrock-data` publishes, as the two
 * lists `buildCreativeContent` takes. The group list is indexed by an entry's
 * `group`, so the two only mean anything together.
 */
const catalog: CreativeCatalog = { groups: creative_groups, entries: creativeitems };

/** The empty `ItemInstanceUserData` blob, which every stack with no NBT carries. */
const emptyUserData = (): Buffer => {
    const stream = new NetworkBinaryStream();
    new ItemInstanceUserData(null).serialize(stream);
    return stream.getBuffer();
};

const EMPTY_USER_DATA = emptyUserData();

/**
 * The blob a stack's `User Data Buffer` carries.
 *
 * The catalog stores an entry's NBT as a plain little endian compound, which
 * is the flavor `ItemInstanceUserData` writes it back out in. Items with
 * `minecraft:blocks_attacks` also carry the blocking tick in this structure.
 */
const userDataFor = (nbt: Buffer | undefined, blocksAttacks: boolean): Buffer => {
    if (nbt === undefined && !blocksAttacks) return EMPTY_USER_DATA;

    const compound =
        nbt === undefined ? null : NBTTagCompound.readFromStream(new BinaryStream(nbt), ByteOrder.LITTLE_ENDIAN);
    const stream = new NetworkBinaryStream();
    new ItemInstanceUserData(compound, blocksAttacks ? { blockingTick: 0n } : {}).serialize(stream);

    return stream.getBuffer();
};

/**
 * One creative instance as the plain stack a protocol payload carries.
 *
 * Air is the empty slot, and the empty slot is a bare zero rather than the
 * number the item table has for the name: `minecraft:air` is -158 there, and
 * writing that leaves the client holding a real item in every unused slot.
 */
const creativeStack = (
    instance: WireItemInstance,
    content: ServerContent,
    toClient: (runtimeId: number) => number
): ItemStackData => ({
    runtimeId: instance.name === 'minecraft:air' ? 0 : instance.runtimeId,
    count: instance.count,
    meta: instance.meta,
    blockRuntimeId: toClient(instance.blockRuntimeId),
    userData: userDataFor(
        instance.nbt,
        content.items.types.get(instance.name)?.hasComponent('minecraft:blocks_attacks') ?? false
    )
});

/**
 * The unlocking requirement of a recipe in the recipe book: none the client checks itself, so the
 * recipe stays out of the book until an `UnlockedRecipesPacket` names it.
 *
 * Java's recipe book holds only the recipes the server unlocked, through `/recipe` and the
 * `recipes/` advancements, and this is how the Bedrock book is made to agree. The pinned Bedrock
 * Dedicated Server writes the same requirement, the `NONE` context with an empty list, for 525
 * of its crafting table recipes. It writes `ALWAYS_UNLOCKED` for only 20 recipes.
 */
const BOOK_UNLOCKING = { context: RecipeUnlockingContext.NONE, ingredients: [] };

/**
 * The station of the recipes the book holds. Java's stonecutter lists every recipe whatever the
 * book holds, so a recipe at any other station keeps the packet's default, which unlocks it from
 * the start.
 */
const BOOK_STATION = 'crafting_table';

/** The unlocking requirement of an entry at a station, or none for the packet's default. */
const unlockingAt = (station: string): { unlocking?: typeof BOOK_UNLOCKING } =>
    station === BOOK_STATION ? { unlocking: BOOK_UNLOCKING } : {};

/**
 * Which book entries each Java recipe stands behind, from the entries' net ids.
 *
 * @param entries - The crafting entries, each with its id and net id.
 * @param recipesByNetId - The Java recipes behind each net id.
 */
const bookEntriesOf = (
    entries: Iterable<{ readonly id: string; readonly netId: number; readonly station: string }>,
    recipesByNetId: ReadonlyMap<number, readonly string[]>
): ReadonlyMap<string, readonly string[]> => {
    const byRecipe = new Map<string, string[]>();
    for (const entry of entries) {
        if (entry.station !== BOOK_STATION) continue;
        for (const recipe of recipesByNetId.get(entry.netId) ?? []) {
            const held = byRecipe.get(recipe);
            if (held === undefined) byRecipe.set(recipe, [entry.id]);
            else held.push(entry.id);
        }
    }
    return byRecipe;
};

/**
 * How a recipe's output reaches the client: its item id, and the hashed
 * runtime id of the block it places when it places one.
 *
 * A recipe names its result by identifier, and both numbers have to be
 * resolved against this build's own registries so that the stack a client is
 * shown and the block it ends up holding are the same thing.
 */
const resultStack =
    (items: ItemIdLookup, content: ServerContent, toClient: (runtimeId: number) => number) =>
    (result: WireResult): ItemStackData => {
        const block = content.blocks.types.get(result.name);

        return {
            runtimeId: items(result.name) ?? 0,
            count: result.count,
            meta: result.meta,
            blockRuntimeId: block === undefined ? 0 : toClient(blockRuntimeId(result.name, block.state().values)),
            userData: EMPTY_USER_DATA
        };
    };

/**
 * The blocks this server invented, which the client can only learn about
 * from `StartGamePacket.Block Properties`.
 *
 * A block the client palette already has is left out, for two reasons. The
 * client has it, and the definition this build holds for one is the
 * `jsprismarine_vanilla` overlay's property row rather than Mojang's own
 * file: the overlay declares every palette block and `@jsprismarine/packs`
 * replaces a definition whole, so Mojang's geometry, material instances and
 * `internal_vanilla_data` are gone by the time the registry is resolved. The
 * 98 vanilla blocks Mojang defines in data still have to be declared, and
 * those travel as the bytes a Bedrock Dedicated Server 1.26.60.6 sent.
 */
const inventedBlocksOf = (content: ServerContent, client: BlockPalette) =>
    [...content.blocks.types.values()].filter((type) => client.entry(type.identifier) === undefined);

/** A pack block's `menu_category`, with the state its creative entry places. */
const blockPlacement = (type: BlockType): PackMenuPlacement => {
    const menu = type.definition.description.menuCategory;
    return {
        name: type.identifier,
        category: menu?.category,
        ...(menu?.group === undefined ? {} : { group: menu.group }),
        blockRuntimeId: blockRuntimeId(type.identifier, type.state().values)
    };
};

/**
 * A pack item's `description.menu_category`, read from the file the pack loaded.
 *
 * `@jsprismarine/items` keeps the Bedrock file beside the type and reads only its components,
 * so the description is read here, the one place that needs it.
 */
const itemPlacement = (type: ItemType): PackMenuPlacement => {
    const root = type.bedrockDefinition?.data;
    const item = isRecord(root) ? root['minecraft:item'] : undefined;
    const description = isRecord(item) ? item.description : undefined;
    const menu = isRecord(description) ? description.menu_category : undefined;
    const category = isRecord(menu) && typeof menu.category === 'string' ? menu.category : undefined;
    const group = isRecord(menu) && typeof menu.group === 'string' && menu.group !== '' ? menu.group : undefined;
    return { name: type.identifier, category, ...(group === undefined ? {} : { group }) };
};

/**
 * Where each block and item the client does not know asks to sit in the creative menu.
 *
 * Only content the client has no number for counts: a pack file that overrides a vanilla block
 * or item keeps that item's vanilla entry, and the captured catalog already files it.
 */
const packMenuPlacements = (
    content: ServerContent,
    invented: readonly BlockType[],
    table: ProtocolItemData['table']
): PackMenuPlacement[] => [
    ...invented.map(blockPlacement),
    ...[...content.items.types.values()]
        .filter((type) => type.bedrockDefinition !== undefined && !(type.identifier in table))
        .map(itemPlacement)
];

/** How to build; everything has a default that matches a real client. */
export interface ContentPayloadOptions {
    /**
     * The palette a client has, which is the authority both checks measure
     * against. The captured vanilla palette by default.
     */
    readonly clientPalette?: BlockPalette;
    /**
     * The item registry data the session speaks, from its codec's
     * {@link import('../../network/codec/itemData').ProtocolItemData}. The newest release's by
     * default, which is what every caller that does not know a session gets.
     */
    readonly itemData?: ProtocolItemData;
}

/**
 * Builds the four payloads and checks the palette behind them.
 *
 * @param content - The build to send. Nothing is read from the server's own
 *   managers, so two servers with the same content send the same bytes.
 * @throws {import('./contentPalette').ContentPaletteError} When the content
 *   palette disagrees with the one a client has.
 * @throws {import('@jsprismarine/protocol/bedrock/payload').BlockPaletteError} When a declared
 *   definition names a vanilla block the client palette does not have, or
 *   declares a state the client disagrees with.
 */
export const buildNetworkContentPayloads = (
    content: ServerContent,
    options: ContentPayloadOptions = {}
): NetworkContentPayloads => {
    const client = options.clientPalette ?? vanillaBlockPalette();
    assertContentPaletteAgrees(content.blocks.palette, client, content.withheld.blocks);

    // Every invented block comes from a pack: Mojang's own data-driven blocks are in the client
    // palette and travel as captured.
    const invented = inventedBlocksOf(content, client);
    const declared = buildBlockProperties(invented, { fromPacks: true });
    assertBlockPaletteAgrees(declared.properties, client);

    const { table } = options.itemData ?? canonicalItemData;
    // The vanilla menu with each pack's `item_catalog` merged in, then the packs' blocks and items
    // their own files place, which both the item registry's tab and heading and the creative
    // packet are read from.
    const menu = withPackMenuPlacements(
        mergeItemCatalogs(catalog, content.definitions.itemCatalog.values(), content),
        packMenuPlacements(content, invented, table)
    );

    const items = buildItemRegistry(content.items.types.values(), {
        table,
        capturedComponents: capturedItemComponents,
        projection: {
            mapIdentifier: (javaId) => {
                const mapped = javaItemToBedrock(javaId);
                return mapped.kind === 'unknown' ? undefined : mapped.bedrock.identifier;
            },
            resolveItemTag: (tag) => (content.tags.has('item', tag) ? content.tags.members('item', tag) : undefined),
            mapBlockIdentifier: (javaId) => {
                const mapped = javaBlockStateToBedrock(javaId);
                return mapped.kind === 'unknown' ? undefined : mapped.bedrock.name;
            },
            resolveBlockTag: (tag) => (content.tags.has('block', tag) ? content.tags.members('block', tag) : undefined)
        },
        // The two `item_properties` keys no Java component decides and the
        // creative catalog does: which tab an item sits in and under which
        // heading. A pack item's own file decides them for it.
        bedrockOnly: menu.itemProperties,
        // Each declared block needs an item, or the client closes before it spawns.
        blocks: declared.blockIds
    });

    const itemIds = itemIdsOf(items.entries);
    const creative = buildCreativeContent(itemIds, menu.catalog);
    const compiled = compileRecipeBook(content.recipes, javaItemToBedrock);
    const crafting = buildCraftingData(compiled.recipes, {
        items: itemIds,
        // The Bedrock recipe descriptor has room for one item or one item tag. Keep every
        // Java tag alternative only when a known Bedrock tag names the exact same set.
        bedrockTagFor: (items) => bedrockItemTagsByItems.get(itemSetKey(items))
    });
    // Block ids as the session's release writes them; the payloads are built per version.
    const { toClient } = blockTranslationFor(versionOf(options));
    const output = resultStack(itemIds, content, toClient);

    return {
        // Mojang's data-driven vanilla blocks first, in the order the capture
        // lists them and only the ones this build actually holds, then the
        // blocks this server invented; see {@link inventedBlocksOf}.
        blockProperties: [
            ...block_definitions.filter((entry) => content.blocks.types.has(entry.name)),
            ...declared.properties
        ],
        items: items.entries,
        creative: {
            groups: creative.groups.map((group) => ({
                category: group.category,
                name: group.name,
                icon: creativeStack(group.icon, content, toClient)
            })),
            // The writer numbers entries one-based by position, which is the
            // same number `buildCreativeContent` put in `creativeNetId`, so
            // the order is the whole of the agreement and nothing renumbers.
            entries: creative.entries.map((entry) => ({
                item: creativeStack(entry.item, content, toClient),
                group: entry.group
            }))
        },
        creativeItems: creative.entries.map((entry) => entry.item),
        crafting: {
            shaped: crafting.shaped.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                width: recipe.width,
                height: recipe.height,
                pattern: recipe.pattern,
                outputs: recipe.outputs.map(output),
                priority: recipe.priority,
                symmetric: recipe.symmetric,
                ...unlockingAt(recipe.station)
            })),
            shapeless: crafting.shapeless.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                ingredients: recipe.ingredients,
                outputs: recipe.outputs.map(output),
                priority: recipe.priority,
                ...unlockingAt(recipe.station)
            })),
            multi: crafting.multi.map((recipe) => ({
                uuid: Buffer.from(recipe.uuid.replaceAll('-', ''), 'hex'),
                netId: recipe.netId
            })),
            userDataShapeless: crafting.userDataShapeless.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                ingredients: recipe.ingredients,
                outputs: recipe.outputs.map(output),
                priority: recipe.priority,
                ...unlockingAt(recipe.station)
            })),
            shapelessChemistry: [],
            shapedChemistry: [],
            smithingTransform: crafting.smithingTransform.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                template: recipe.template,
                base: recipe.base,
                addition: recipe.addition,
                output: output(recipe.output)
            })),
            smithingTrim: crafting.smithingTrim.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                template: recipe.template,
                base: recipe.base,
                addition: recipe.addition
            })),
            // The one entry that names nothing: a brewing recipe carries the
            // three items as numbers, which is why `buildCraftingData` needs
            // the item registry before it can produce any of these.
            potionMixes: crafting.potionMixes.map((mix): PotionMix => ({
                inputId: mix.inputId,
                inputMeta: mix.inputMeta,
                reagentId: mix.reagentId,
                reagentMeta: mix.reagentMeta,
                outputId: mix.outputId,
                outputMeta: mix.outputMeta
            })),
            containerMixes: [],
            materialReducers: materialReducersOf(content.materialReductions, itemIds),
            cleanRecipes: true
        },
        recipesByNetId: crafting.recipesByNetId,
        bookEntriesByRecipe: bookEntriesOf(
            [...crafting.shaped, ...crafting.shapeless, ...crafting.userDataShapeless],
            crafting.recipesByNetId
        ),
        report: {
            inventedBlocks: declared.properties.length,
            allocatedItemIds: items.allocated.map((entry) => entry.identifier),
            unnumberedBlocks: items.unnumberedBlocks.map((entry) => entry.identifier),
            untranslatedComponents: declared.untranslated.map((entry) => `${entry.block}/${entry.component}`),
            unknownCreativeItems: creative.unknown,
            omittedRecipes: crafting.omitted.length,
            widenedIngredients: crafting.widened.length
        }
    };
};

/**
 * One build per content object and protocol version, since within a version the payloads are
 * the same for every player.
 */
const cache = new WeakMap<ServerContent, Map<number, NetworkContentPayloads>>();

/** Builds that threw, by content and version, so a join does not pay for the same failure again. */
const failed = new WeakMap<ServerContent, Set<number>>();

/** The version a set of options builds for, which is the cache's second key. */
const versionOf = (options: ContentPayloadOptions): number => (options.itemData ?? canonicalItemData).protocolVersion;

const cached = (content: ServerContent, options: ContentPayloadOptions): NetworkContentPayloads | undefined =>
    cache.get(content)?.get(versionOf(options));

const remember = (
    content: ServerContent,
    options: ContentPayloadOptions,
    built: NetworkContentPayloads
): NetworkContentPayloads => {
    let byVersion = cache.get(content);
    if (byVersion === undefined) {
        byVersion = new Map();
        cache.set(content, byVersion);
    }
    byVersion.set(versionOf(options), built);

    return built;
};

/**
 * The payloads for one content build, built on first use and kept.
 *
 * @throws The same errors {@link buildNetworkContentPayloads} throws, on the
 *   first call only; a build that threw is not cached.
 */
export const networkContentPayloads = (
    content: ServerContent,
    options: ContentPayloadOptions = {}
): NetworkContentPayloads => {
    const existing = cached(content, options);
    if (existing !== undefined) return existing;

    return remember(content, options, buildNetworkContentPayloads(content, options));
};

/**
 * The first `limit` recipes of a crafting payload.
 *
 * This is the `crafting-recipe-limit` setting, which exists so a client that
 * rejects the packet can be answered with a short one. The lists are drawn
 * down in wire order against one budget, so a limit of one leaves a single
 * shaped recipe and nothing else. Net ids are a recipe's place in the full
 * list and are kept, so trimming never renumbers what a client refers to.
 *
 * @param limit - How many recipes to keep. Zero keeps none.
 */
export const limitCraftingData = (crafting: CraftingData, limit: number): CraftingData => {
    let left = Math.max(limit, 0);
    const take = <T>(list: readonly T[]): readonly T[] => {
        const taken = list.slice(0, left);
        left -= taken.length;

        return taken;
    };

    return {
        shaped: take(crafting.shaped),
        shapeless: take(crafting.shapeless),
        multi: take(crafting.multi),
        userDataShapeless: take(crafting.userDataShapeless),
        shapelessChemistry: take(crafting.shapelessChemistry),
        shapedChemistry: take(crafting.shapedChemistry),
        smithingTransform: take(crafting.smithingTransform),
        smithingTrim: take(crafting.smithingTrim),
        potionMixes: take(crafting.potionMixes),
        containerMixes: take(crafting.containerMixes),
        materialReducers: take(crafting.materialReducers),
        cleanRecipes: crafting.cleanRecipes
    };
};

/**
 * The material reducer entries of a behavior pack's material reduction recipes.
 *
 * `From Item Key` packs the input's item id into the high 16 bits and its data value into the
 * low ones. An entry naming an item the registry has no id for is left out; the content build
 * already reported it against its file.
 */
const materialReducersOf = (
    reductions: ServerContent['materialReductions'],
    itemIds: ItemIdLookup
): MaterialReducer[] =>
    reductions.flatMap((reduction) => {
        const inputId = itemIds(reduction.input.identifier);
        const outputs = reduction.outputs.map((output) => ({
            itemId: itemIds(output.identifier),
            itemCount: output.count
        }));
        if (inputId === undefined || outputs.some((output) => output.itemId === undefined)) return [];
        return [
            {
                fromItemKey: (inputId << 16) | (reduction.input.data & 0xffff),
                outputs: outputs.flatMap(({ itemId, itemCount }) =>
                    itemId === undefined ? [] : [{ itemId, itemCount }]
                )
            }
        ];
    });

/** The recipes of every kind the crafting payload carries. */
export const craftingRecipeCount = (crafting: CraftingData): number =>
    crafting.shaped.length +
    crafting.shapeless.length +
    crafting.multi.length +
    crafting.userDataShapeless.length +
    crafting.shapelessChemistry.length +
    crafting.shapedChemistry.length +
    crafting.smithingTransform.length +
    crafting.smithingTrim.length +
    crafting.potionMixes.length +
    crafting.containerMixes.length +
    crafting.materialReducers.length;

/** What the join burst sends, as the line an operator reads at startup. */
export const contentPayloadSummary = (payloads: NetworkContentPayloads): string =>
    `Join payloads from the content: §e${payloads.blockProperties.length}§r block definitions, ` +
    `§e${payloads.items.length}§r items, §e${payloads.creative.entries.length}§r creative entries ` +
    `under §e${payloads.creative.groups.length}§r headings, §e${craftingRecipeCount(payloads.crafting)}§r recipes`;

/**
 * What the build had to invent or could not say, or undefined when it said
 * everything exactly.
 *
 * Each clause is left out when its count is zero, so a clean build produces
 * nothing and anything printed is worth reading.
 */
export const contentPayloadWarning = (report: ContentPayloadReport): string | undefined => {
    // Annotated rather than `as const`: scriptc 0.4.10 aborts its analysis on a literal tuple list
    // destructured in a callback ("a narrowed value does not have the type its narrowing proved").
    const clauses: readonly (readonly [number, string])[] = [
        [report.inventedBlocks, 'invented §e%§r blocks the client has to be told about'],
        [report.allocatedItemIds.length, 'gave §e%§r items an id of its own'],
        [report.unnumberedBlocks.length, 'sent no item for §e%§r blocks, since another item has its number'],
        [report.untranslatedComponents.length, 'could not translate §e%§r block components'],
        [report.unknownCreativeItems.length, 'left §e%§r creative entries out, since no item names them'],
        [report.omittedRecipes, 'left §e%§r recipes out, since the wire has no list for them'],
        [report.widenedIngredients, 'narrowed §e%§r recipe ingredients to one item']
    ];

    const said = clauses.filter(([count]) => count > 0).map(([count, text]) => text.replaceAll('%', String(count)));

    return said.length === 0 ? undefined : `The content build ${said.join(', ')}`;
};

/**
 * The join payloads for a content build, or undefined when there is no build
 * or the build could not produce them.
 *
 * This is what the join burst reads, so it never throws. A build whose
 * payloads cannot be produced leaves every packet on the captured path it
 * used before the content build existed, which is a server that still works
 * rather than a client that cannot join.
 *
 * The first call does the work and logs what the content build invented;
 * every call after it answers from the cache without logging again. Calling
 * it once at startup is what puts that line in front of an operator before a
 * player arrives.
 *
 * @param content - `Server.getContent()`. Undefined is still accepted and
 *   still answers undefined, which is what a caller holding the private
 *   `Server.content` field before the build has run would pass.
 * @param logger - Where the report, and any failure, go.
 */
export const joinContentPayloads = (
    content: ServerContent | undefined,
    logger: Pick<Logger, 'info' | 'warn' | 'error'>,
    options: ContentPayloadOptions = {}
): NetworkContentPayloads | undefined => {
    if (content === undefined) return undefined;

    const existing = cached(content, options);
    if (existing !== undefined) return existing;
    if (failed.get(content)?.has(versionOf(options)) === true) return undefined;

    try {
        const built = remember(content, options, buildNetworkContentPayloads(content, options));

        logger.info(contentPayloadSummary(built));
        const warning = contentPayloadWarning(built.report);
        if (warning !== undefined) logger.warn(warning);

        return built;
    } catch (error: unknown) {
        const versions = failed.get(content) ?? new Set<number>();
        versions.add(versionOf(options));
        failed.set(content, versions);
        logger.error(error);
        logger.warn('The content build produced no join payloads; the captured ones go out instead');

        return undefined;
    }
};

/**
 * The recipe book entries of each Java recipe, from the payloads of the content a session's client
 * was sent. The payloads are looked up on each call, so a content reload is followed, and a build
 * with no payloads names each recipe by its own id.
 *
 * @param server - Where the content and the logger come from.
 * @param itemData - The item registry data the session speaks, read on each call.
 */
export const recipeBookEntriesOf =
    (
        server: { getContent(): ServerContent | undefined; getLogger(): Pick<Logger, 'info' | 'warn' | 'error'> },
        itemData: () => ProtocolItemData
    ): RecipeBookEntries =>
    (recipe) => {
        const payloads = joinContentPayloads(server.getContent(), server.getLogger(), { itemData: itemData() });
        return payloads === undefined ? [recipe] : (payloads.bookEntriesByRecipe.get(recipe) ?? []);
    };
