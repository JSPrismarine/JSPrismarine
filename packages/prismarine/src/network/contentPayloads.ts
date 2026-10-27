/**
 * The four join payloads, built from the content registries instead of from
 * the server's own tables.
 *
 * A Bedrock client builds its world out of what the join burst tells it:
 * `StartGamePacket.Block Properties`, `ItemRegistryPacket`,
 * `CreativeContentPacket` and `CraftingDataPacket`. `@jsprismarine/wire` owns
 * the translation from a content registry into each of those, and
 * `@jsprismarine/protocol` owns the bytes. This module is the join between
 * them: it picks which blocks and items the client has to be told about,
 * calls the four builders, and turns their results into the payload shapes
 * the packets write.
 *
 * It is built once per `ServerContent`. A content reload replaces that object
 * whole, so the cache is a `WeakMap` keyed on it and nothing has to be
 * invalidated by hand.
 */
import { block_definitions, creative_groups, creativeitems, item_table } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import { ItemInstanceUserData, NetworkBinaryStream, blockRuntimeId } from '@jsprismarine/protocol';
import { compileRecipeBook } from '@jsprismarine/recipes';
import {
    assertBlockPaletteAgrees,
    buildBlockProperties,
    buildCraftingData,
    buildCreativeContent,
    buildItemRegistry,
    creativeItemProperties,
    itemIdsOf
} from '@jsprismarine/wire';

import { assertContentPaletteAgrees } from './contentPalette';

import type { ServerContent } from '../content/ServerContent';
import type { BlockPalette } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import type {
    BlockProperty,
    CraftingData,
    CreativeContent,
    ItemRegistryEntry,
    ItemStackData,
    PotionMix
} from '@jsprismarine/protocol';
import type { CreativeCatalog, ItemIdLookup, WireItemInstance, WireResult } from '@jsprismarine/wire';

/** What the server had to invent or could not say, so a startup line can report it. */
export interface ContentPayloadReport {
    /** How many blocks this server invented and had to define for the client. */
    readonly inventedBlocks: number;
    /** Items with no row in the captured table, which were given ids of this server's own. */
    readonly allocatedItemIds: readonly string[];
    /** Block components no translation covers, as `block/component`. */
    readonly untranslatedComponents: readonly string[];
    /** Creative entries whose item the registry does not name, so they were dropped. */
    readonly unknownCreativeItems: readonly string[];
    /** Recipes with no Bedrock form, which the client is never told about. */
    readonly omittedRecipes: number;
    /** Ingredients narrowed to one item because the wire has room for one. */
    readonly widenedIngredients: number;
    /** Smithing trim recipes, which protocol 2193's packet has no list for. */
    readonly smithingTrimRecipes: number;
    /** Cooking recipes, which protocol 2193's packet has no list for. */
    readonly furnaceRecipes: number;
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
 * is the flavor `ItemInstanceUserData` writes it back out in. A shield ends
 * the blob with its blocking tick and nothing else does, which is a fact
 * about the item rather than about the data.
 */
const userDataFor = (name: string, nbt: Buffer | undefined): Buffer => {
    if (nbt === undefined && name !== 'minecraft:shield') return EMPTY_USER_DATA;

    const compound =
        nbt === undefined ? null : NBTTagCompound.readFromStream(new BinaryStream(nbt), ByteOrder.LITTLE_ENDIAN);
    const stream = new NetworkBinaryStream();
    new ItemInstanceUserData(compound, name === 'minecraft:shield' ? { blockingTick: 0n } : {}).serialize(stream);

    return stream.getBuffer();
};

/**
 * One creative instance as the plain stack a protocol payload carries.
 *
 * Air is the empty slot, and the empty slot is a bare zero rather than the
 * number the item table has for the name: `minecraft:air` is -158 there, and
 * writing that leaves the client holding a real item in every unused slot.
 */
const creativeStack = (instance: WireItemInstance): ItemStackData => ({
    runtimeId: instance.name === 'minecraft:air' ? 0 : instance.runtimeId,
    count: instance.count,
    meta: instance.meta,
    blockRuntimeId: instance.blockRuntimeId,
    userData: userDataFor(instance.name, instance.nbt)
});

/**
 * How a recipe's output reaches the client: its item id, and the hashed
 * runtime id of the block it places when it places one.
 *
 * A recipe names its result by identifier, and both numbers have to be
 * resolved against this build's own registries so that the stack a client is
 * shown and the block it ends up holding are the same thing.
 */
const resultStack =
    (items: ItemIdLookup, content: ServerContent) =>
    (result: WireResult): ItemStackData => {
        const block = content.blocks.types.get(result.name);

        return {
            runtimeId: items(result.name) ?? 0,
            count: result.count,
            meta: result.meta,
            blockRuntimeId: block === undefined ? 0 : blockRuntimeId(result.name, block.state().values),
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
 * those travel as the bytes a Bedrock Dedicated Server 1.26.51.1 sent.
 */
const inventedBlocksOf = (content: ServerContent, client: BlockPalette) =>
    [...content.blocks.types.values()].filter((type) => client.entry(type.identifier) === undefined);

/** How to build; everything has a default that matches a real client. */
export interface ContentPayloadOptions {
    /**
     * The palette a client has, which is the authority both checks measure
     * against. The captured vanilla palette by default.
     */
    readonly clientPalette?: BlockPalette;
}

/**
 * Builds the four payloads and checks the palette behind them.
 *
 * @param content - The build to send. Nothing is read from the server's own
 *   managers, so two servers with the same content send the same bytes.
 * @throws {import('./contentPalette').ContentPaletteError} When the content
 *   palette disagrees with the one a client has.
 * @throws {import('@jsprismarine/wire').BlockPaletteError} When a declared
 *   definition names a vanilla block the client palette does not have, or
 *   declares a state the client disagrees with.
 */
export const buildNetworkContentPayloads = (
    content: ServerContent,
    options: ContentPayloadOptions = {}
): NetworkContentPayloads => {
    const client = options.clientPalette ?? vanillaBlockPalette();
    assertContentPaletteAgrees(content.blocks.palette, client);

    const declared = buildBlockProperties(inventedBlocksOf(content, client));
    assertBlockPaletteAgrees(declared.properties, client);

    const items = buildItemRegistry(content.items.types.values(), {
        table: item_table,
        projection: {
            mapIdentifier: (javaId) => {
                const mapped = javaItemToBedrock(javaId);
                return mapped.kind === 'unknown' ? undefined : mapped.bedrock.identifier;
            }
        },
        // The two `item_properties` keys no Java component decides and the
        // creative catalog does: which tab an item sits in and under which
        // heading.
        bedrockOnly: creativeItemProperties(catalog)
    });

    const itemIds = itemIdsOf(items.entries);
    const creative = buildCreativeContent(itemIds, catalog);
    const compiled = compileRecipeBook(content.recipes, javaItemToBedrock);
    const crafting = buildCraftingData(compiled.recipes, { items: itemIds });
    const output = resultStack(itemIds, content);

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
                icon: creativeStack(group.icon)
            })),
            // The writer numbers entries one-based by position, which is the
            // same number `buildCreativeContent` put in `creativeNetId`, so
            // the order is the whole of the agreement and nothing renumbers.
            entries: creative.entries.map((entry) => ({ item: creativeStack(entry.item), group: entry.group }))
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
                symmetric: recipe.symmetric
            })),
            shapeless: crafting.shapeless.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                ingredients: recipe.ingredients,
                outputs: recipe.outputs.map(output),
                priority: recipe.priority
            })),
            smithingTransform: crafting.smithingTransform.map((recipe) => ({
                id: recipe.id,
                netId: recipe.netId,
                station: recipe.station,
                template: recipe.template,
                base: recipe.base,
                addition: recipe.addition,
                output: output(recipe.output)
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
            cleanRecipes: true
        },
        report: {
            inventedBlocks: declared.properties.length,
            allocatedItemIds: items.allocated.map((entry) => entry.identifier),
            untranslatedComponents: declared.untranslated.map((entry) => `${entry.block}/${entry.component}`),
            unknownCreativeItems: creative.unknown,
            omittedRecipes: crafting.omitted.length,
            widenedIngredients: crafting.widened.length,
            smithingTrimRecipes: crafting.smithingTrim.length,
            furnaceRecipes: crafting.furnace.length
        }
    };
};

/** One build per content object, since the payloads are the same for every player. */
const cache = new WeakMap<ServerContent, NetworkContentPayloads>();

/** Builds that threw, so a join does not pay for the same failure again. */
const failed = new WeakSet<ServerContent>();

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
    const existing = cache.get(content);
    if (existing !== undefined) return existing;

    const built = buildNetworkContentPayloads(content, options);
    cache.set(content, built);

    return built;
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
        smithingTransform: take(crafting.smithingTransform),
        potionMixes: take(crafting.potionMixes),
        cleanRecipes: crafting.cleanRecipes
    };
};

/** The recipes of every kind the crafting payload carries. */
export const craftingRecipeCount = (crafting: CraftingData): number =>
    crafting.shaped.length +
    crafting.shapeless.length +
    crafting.smithingTransform.length +
    crafting.potionMixes.length;

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
    const clauses = [
        [report.inventedBlocks, 'invented §e%§r blocks the client has to be told about'],
        [report.allocatedItemIds.length, 'gave §e%§r items an id of its own'],
        [report.untranslatedComponents.length, 'could not translate §e%§r block components'],
        [report.unknownCreativeItems.length, 'left §e%§r creative entries out, since no item names them'],
        [report.omittedRecipes, 'left §e%§r recipes out, since the wire has no list for them'],
        [report.widenedIngredients, 'narrowed §e%§r recipe ingredients to one item'],
        [report.smithingTrimRecipes, 'held back §e%§r smithing trim recipes'],
        [report.furnaceRecipes, 'held back §e%§r cooking recipes']
    ] as const;

    const said = clauses.filter(([count]) => count > 0).map(([count, text]) => text.replace('%', String(count)));

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
    logger: Logger,
    options: ContentPayloadOptions = {}
): NetworkContentPayloads | undefined => {
    if (content === undefined) return undefined;

    const existing = cache.get(content);
    if (existing !== undefined) return existing;
    if (failed.has(content)) return undefined;

    try {
        const built = buildNetworkContentPayloads(content, options);
        cache.set(content, built);

        logger.info(contentPayloadSummary(built));
        const warning = contentPayloadWarning(built.report);
        if (warning !== undefined) logger.warn(warning);

        return built;
    } catch (error: unknown) {
        failed.add(content);
        logger.error(error);
        logger.warn('The content build produced no join payloads; the captured ones go out instead');

        return undefined;
    }
};
