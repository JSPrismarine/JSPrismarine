import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { craftingDataPacket } from '../wire/definitions/craftingData';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { CraftingDataPayload } from '../wire/definitions/craftingData';

import { RecipeUnlockingContext, recipeUuidFor } from '../wire/definitions/craftingData';
export { RecipeUnlockingContext, recipeUuidFor };
import type {
    ContainerMix,
    MaterialReducer,
    MaterialReducerOutput,
    MultiRecipe,
    PotionMix,
    ShapedRecipe,
    ShapelessRecipe,
    SmithingTransformRecipe,
    SmithingTrimRecipe,
    UnlockingRequirement
} from '../wire/definitions/craftingData';
export type {
    ContainerMix,
    MaterialReducer,
    MaterialReducerOutput,
    MultiRecipe,
    PotionMix,
    ShapedRecipe,
    ShapelessRecipe,
    SmithingTransformRecipe,
    SmithingTrimRecipe,
    UnlockingRequirement
};

/** The lists `CraftingDataPacket` carries, and the flag that closes it. */
export type CraftingData = CraftingDataPayload;

/**
 * Writes the eleven arrays and the flag without a packet header, for a caller that writes its
 * own. The layout has no version gate, so it is the same at every protocol.
 */
export const writeCraftingData = (stream: NetworkBinaryStream, data: CraftingData): void => {
    layoutAt(craftingDataPacket, protocolVersion).encode(stream, data);
};

/**
 * Reads the eleven arrays and the flag, the mirror of {@link writeCraftingData}.
 */
export const readCraftingData = (stream: NetworkBinaryStream): CraftingData =>
    layoutAt(craftingDataPacket, protocolVersion).decode(stream);

/**
 * Every recipe the client is allowed to know about.
 *
 * Sent once, on join, and identical for every player, so the encoded form is worth keeping.
 *
 * Wire order is eleven arrays and a flag, each array a varuint count followed by its entries:
 * Shaped Recipes, Shapeless Recipes, Multi Recipes, User Data Shapeless Recipes, Shapeless
 * Chemistry Recipes, Shaped Chemistry Recipes, Smithing Transform Recipes, Smithing Trim
 * Recipes, Potion Mixes, Container Mixes, Material Reducers, then Clear Recipes as a boolean.
 * There is no type id in front of a recipe: its list is its type. The layout is the same at
 * protocols 2193 and 2225. Cooking recipes have no list at all, because smelting became
 * client-side data; a server still smelts with its own recipes, it just no longer says so here.
 *
 * An ingredient is the legacy descriptor form and not the `recipe-ingredient` type page's. A
 * result is an `ItemStack`.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/crafting-data-packet/
 */
export default class CraftingDataPacket extends NetworkPacket<CraftingData> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CraftingDataPacket';
    }

    public get id(): number {
        return PacketIdentifier.CRAFTING_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CraftingData): void {
        layoutAt(craftingDataPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CraftingData {
        return layoutAt(craftingDataPacket, this.codecProtocol).decode(stream);
    }
}
