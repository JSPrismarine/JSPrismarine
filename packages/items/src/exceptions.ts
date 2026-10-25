/**
 * The reviewed exception list for the generated item type table.
 *
 * Mapping 1658 Java items onto 1606 Bedrock identifiers loses rows two ways,
 * and neither is allowed to happen quietly. A reviewed loss is a Java item
 * Bedrock has no equivalent for, which `@jsprismarine/mapping` already lists;
 * a merge is several Java items reaching one Bedrock identifier, where only
 * one of them can supply that identifier's Java-sourced properties.
 *
 * The generator computes the same set from the mapping tables and refuses to
 * emit when it disagrees with this file, so adding a row is how a maintainer
 * accepts a new gap, and a row that stops matching fails the build.
 */

const TRANSLATION_NOTE = 'docs/research/java-to-bedrock-translation.md';

/** Why a Java item contributes no row of its own to the item type table. */
export type ItemExceptionKind =
    /** Bedrock has no equivalent item; `@jsprismarine/mapping` lists the fallback. */
    | 'loss'
    /** Several Java items share one Bedrock identifier and another one supplies its properties. */
    | 'merge';

/** One reviewed reason a group of Java items carries no item type row. */
export interface ItemTableException {
    readonly kind: ItemExceptionKind;
    /** The Java items this row accounts for. */
    readonly javaIds: readonly string[];
    /** The Bedrock identifier they reach instead. */
    readonly bedrockId: string;
    /** The Java item that supplies that identifier's components, absent for a loss onto an unused identifier. */
    readonly supersededBy?: string;
    /** Why the gap is acceptable, and what recovers the lost identity where anything does. */
    readonly reason: string;
    readonly reference: string;
}

/**
 * Every Java item the table drops, grouped by Bedrock identifier.
 *
 * Nine rows account for 53 of the 1658 Java items: 6 reviewed losses and 47
 * merged duplicates. The remaining 1605 items each own one of Bedrock's 1606
 * identifiers, and `minecraft:unknown` is the one identifier no item owns,
 * because the only Java items that reach it are the two test blocks.
 */
export const ITEM_TABLE_EXCEPTIONS = [
    {
        kind: 'loss',
        javaIds: ['minecraft:spectral_arrow'],
        bedrockId: 'minecraft:arrow',
        supersededBy: 'minecraft:arrow',
        reason: 'Bedrock has no spectral arrow, so it arrives as a plain arrow and its glow does not recover.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'loss',
        javaIds: ['minecraft:debug_stick'],
        bedrockId: 'minecraft:stick',
        supersededBy: 'minecraft:stick',
        reason: 'Bedrock has no debug stick, so it arrives as a plain stick and does not recover.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'loss',
        javaIds: ['minecraft:knowledge_book'],
        bedrockId: 'minecraft:book',
        supersededBy: 'minecraft:book',
        reason: 'Bedrock has no knowledge book, so it arrives as a plain book and does not recover.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'loss',
        javaIds: ['minecraft:furnace_minecart'],
        bedrockId: 'minecraft:hopper_minecart',
        supersededBy: 'minecraft:hopper_minecart',
        reason: 'Bedrock has no furnace minecart item, and the fallback does not recover it.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'loss',
        javaIds: ['minecraft:test_block', 'minecraft:test_instance_block'],
        bedrockId: 'minecraft:unknown',
        reason: 'Test blocks do not exist on Bedrock. Writing their components onto minecraft:unknown would give the fallback item real properties, so the identifier stays without a row.',
        reference: `${TRANSLATION_NOTE} section 3; GeyserMC/Geyser#6164`
    },
    {
        kind: 'merge',
        javaIds: [
            'minecraft:abandoned_camp_map',
            'minecraft:buried_ancient_city_map',
            'minecraft:buried_mineshaft_map',
            'minecraft:buried_treasure_map',
            'minecraft:buried_trial_chambers_map',
            'minecraft:desert_pyramid_map',
            'minecraft:desert_village_map',
            'minecraft:jungle_pyramid_map',
            'minecraft:ocean_monument_map',
            'minecraft:plains_village_map',
            'minecraft:savanna_village_map',
            'minecraft:snowy_village_map',
            'minecraft:swamp_hut_map',
            'minecraft:taiga_village_map',
            'minecraft:warm_ocean_ruins_map',
            'minecraft:woodland_mansion_map'
        ],
        bedrockId: 'minecraft:filled_map',
        supersededBy: 'minecraft:filled_map',
        reason: 'The 16 structure locator maps are one Bedrock item. They differ from a plain filled map only in their map decorations, which travel in the stack NBT.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'merge',
        javaIds: ['minecraft:tipped_arrow'],
        bedrockId: 'minecraft:arrow',
        supersededBy: 'minecraft:arrow',
        reason: 'A tipped arrow is a plain arrow with potion contents on the stack, and the potion recovers from the Bedrock aux value.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'merge',
        javaIds: [
            'minecraft:blue_banner',
            'minecraft:brown_banner',
            'minecraft:cyan_banner',
            'minecraft:gray_banner',
            'minecraft:green_banner',
            'minecraft:light_blue_banner',
            'minecraft:light_gray_banner',
            'minecraft:lime_banner',
            'minecraft:magenta_banner',
            'minecraft:orange_banner',
            'minecraft:pink_banner',
            'minecraft:purple_banner',
            'minecraft:red_banner',
            'minecraft:white_banner',
            'minecraft:yellow_banner'
        ],
        bedrockId: 'minecraft:banner',
        supersededBy: 'minecraft:black_banner',
        reason: 'The 16 banner colors are one Bedrock item with a damage value. They differ only in name and model, and the color recovers from the Bedrock aux value.',
        reference: `${TRANSLATION_NOTE} section 3`
    },
    {
        kind: 'merge',
        javaIds: [
            'minecraft:black_bed',
            'minecraft:blue_bed',
            'minecraft:brown_bed',
            'minecraft:cyan_bed',
            'minecraft:gray_bed',
            'minecraft:green_bed',
            'minecraft:light_blue_bed',
            'minecraft:light_gray_bed',
            'minecraft:lime_bed',
            'minecraft:magenta_bed',
            'minecraft:orange_bed',
            'minecraft:pink_bed',
            'minecraft:purple_bed',
            'minecraft:red_bed',
            'minecraft:yellow_bed'
        ],
        bedrockId: 'minecraft:bed',
        supersededBy: 'minecraft:white_bed',
        reason: 'The 16 bed colors are one Bedrock item with a damage value. They differ only in name and model, and the color recovers from the Bedrock aux value.',
        reference: `${TRANSLATION_NOTE} section 3`
    }
] as const satisfies readonly ItemTableException[];

/** How many Java items {@link ITEM_TABLE_EXCEPTIONS} accounts for, checked by the generator and the tests. */
export const EXCEPTED_ITEM_COUNT = 53;

/** Every Java item id the exception list covers, flattened. */
export const EXCEPTED_JAVA_ITEMS: readonly string[] = ITEM_TABLE_EXCEPTIONS.flatMap((exception) => exception.javaIds);
