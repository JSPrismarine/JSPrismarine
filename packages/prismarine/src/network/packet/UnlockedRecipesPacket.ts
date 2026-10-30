import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The docs' `UnlockedRecipesPacketPayload::PacketType`, what the client should do with the
 * `Unlocked Recipes List`. Numbered from 0 as the datagen snapshot and the rendered page agree.
 */
export enum UnlockedRecipesType {
    /** Nothing to apply. */
    Empty = 0,
    /** The full set of recipes the player already has, sent once on load. */
    InitiallyUnlocked = 1,
    /** Recipes unlocked since the last packet. */
    NewlyUnlocked = 2,
    /** Recipes to lock again. */
    RemoveUnlocked = 3,
    /** Lock every recipe. The list is ignored. */
    RemoveAll = 4
}

/**
 * Which recipes a player has unlocked.
 *
 * The server sends the full set on load and a delta for every recipe unlocked or locked
 * afterwards, which is what `/recipe give` and `/recipe take` write.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: `Packet Type` as a little-endian uint32 holding an
 * {@link UnlockedRecipesType}, then `Unlocked Recipes List` as a varuint32 count followed by one
 * string per recipe. The type is the one field in this packet that is not a varint.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/unlocked-recipes-packet/
 */
export default class UnlockedRecipesPacket extends FieldNetworkPacket {
    /** What the client should do with {@link UnlockedRecipesPacket.recipes}. */
    public type: UnlockedRecipesType = UnlockedRecipesType.Empty;

    /** The recipe names the type applies to. */
    public recipes: string[] = [];

    /** Reads the type and the recipe list. */
    public decodePayload(): void {
        this.type = this.readUnsignedIntLE();

        this.recipes = [];
        let count = this.readUnsignedVarInt();
        while (count-- > 0) this.recipes.push(NetworkUtil.readString(this));
    }

    /** Writes the type and the recipe list. */
    public encodePayload(): void {
        this.writeUnsignedIntLE(this.type);

        this.writeUnsignedVarInt(this.recipes.length);
        for (const recipe of this.recipes) NetworkUtil.writeString(this, recipe);
    }
}
