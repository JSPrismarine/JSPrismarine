/**
 * ItemStackRequestActionType, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.60 (Minecraft 1.26.60, protocol 2225)
 * Upstream name: ItemStackRequestActionType
 */
export enum ItemStackRequestActionType {
    TAKE = 0,
    PLACE = 1,
    SWAP = 2,
    DROP = 3,
    DESTROY = 4,
    CRAFTING_CONSUME_INPUT = 5,
    CRAFTING_CREATE_SPECIFIC_RESULT = 6,
    LAB_TABLE_COMBINE = 9,
    BEACON_PAYMENT = 10,
    MINE_BLOCK = 11,
    CRAFTING_RECIPE = 12,
    CRAFTING_RECIPE_AUTO = 13,
    CREATIVE_CREATE = 14,
    CRAFTING_RECIPE_OPTIONAL = 15,
    CRAFT_REPAIR_AND_DISENCHANT = 16,
    CRAFTING_LOOM = 17,
    CRAFT_RESERVED_ACTION = 18,
    CRAFTING_NON_IMPLEMENTED_DEPRECATED = 19,
    CRAFTING_RESULTS_DEPRECATED = 20
}
