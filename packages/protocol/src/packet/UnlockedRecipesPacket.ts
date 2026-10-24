import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `UnlockedRecipesPacketPayload::PacketType`, what the client should do with the
 * `Unlocked Recipes List`. Numbered from 0 as the datagen snapshot and the rendered page agree.
 */
export enum UnlockedRecipesType {
    /** Nothing to apply. */
    EMPTY = 0,
    /** The full set of recipes the player already has, sent once on load. */
    INITIALLY_UNLOCKED_RECIPES = 1,
    /** Recipes unlocked since the last packet. */
    NEWLY_UNLOCKED_RECIPES = 2,
    /** Recipes to lock again. */
    REMOVE_UNLOCKED_RECIPES = 3,
    /** Lock every recipe. The list is ignored. */
    REMOVE_ALL_UNLOCKED_RECIPES = 4
}

/** The fields of an `UnlockedRecipesPacket`, in wire order. */
export interface UnlockedRecipes {
    /** `Packet Type`. */
    type: UnlockedRecipesType;
    /** `Unlocked Recipes List`, the recipe names the type applies to. */
    recipes: string[];
}

/**
 * Which recipes the player has unlocked. The server sends the full set on load and a delta for
 * every recipe unlocked or locked afterwards.
 *
 * Protocol 2193 layout, in wire order: `Packet Type` as a little-endian uint32 holding an
 * {@link UnlockedRecipesType}, then `Unlocked Recipes List` as a varuint32 count followed by
 * one string per recipe. Strings are a varuint32 byte length followed by UTF-8. The type is the
 * one field in this packet that is not a varint.
 */
export default class UnlockedRecipesPacket extends NetworkPacket<UnlockedRecipes> {
    public get id(): number {
        return PacketIdentifier.UNLOCKED_RECIPES;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UnlockedRecipes): void {
        stream.writeUnsignedIntLE(data.type);

        stream.writeUnsignedVarInt(data.recipes.length);
        for (const recipe of data.recipes) {
            stream.writeString(recipe);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): UnlockedRecipes {
        const type = stream.readUnsignedIntLE();

        const recipes: string[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            recipes.push(stream.readString());
        }

        return { type, recipes };
    }
}
