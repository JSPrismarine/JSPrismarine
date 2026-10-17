/**
 * RecipeEntryType, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs@0e00fe80f4f3c71572ff6429de40146d1f4412fc (Minecraft 1.26.40, protocol 2168; no schema in v1.26.51)
 * Upstream name: CraftingDataEntryType
 */
export enum RecipeEntryType {
    SHAPELESS = 0,
    SHAPED = 1,
    MULTI_RECIPE = 4,
    USER_DATA_SHAPELESS_RECIPE = 5,
    SHAPELESS_CHEMISTRY_RECIPE = 6,
    SHAPED_CHEMISTRY_RECIPE = 7,
    SMITHING_TRANSFORM = 8,
    SMITHING_TRIM_RECIPE = 9,
    COUNT = 10,
    FURNACE = 2,
    FURNACE_DATA = 3
}
