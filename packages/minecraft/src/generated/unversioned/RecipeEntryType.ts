/**
 * RecipeEntryType, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs@0e00fe80f4f3c71572ff6429de40146d1f4412fc (Minecraft 1.26.40, protocol 2168)
 * Upstream name: CraftingDataEntryType
 *
 * NOT VERSIONED. No `bedrock-protocol-docs` release describes this enum: a schema
 * exists only for a type some packet field is declared with, and this one travels as
 * a plain integer. The members below come from the last `enums.html` Mojang
 * published, for Minecraft 1.26.40, and every protocol this package generates
 * reads them unchanged: 2193, 2225.
 *
 * Treat them as approximate above protocol 2168. A member added since then is
 * missing, and a member removed since then is still here. No source this package will
 * take numbers from publishes this enum per version, so that is a known gap and not
 * something to correct in the generated file.
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
