import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * How an item was used, as the Item Use Method int32 numbers it.
 *
 * Mojang's page for protocol 2193 leaves the field a bare int32 and lists no members. The
 * values are those of `ItemUseMethod` in Mojang's enum snapshot at
 * `packages/minecraft/datagen/snapshot/enums.html`, which gophertunnel reads the same way.
 */
export enum ItemUseMethod {
    Unknown = -1,
    EquipArmor = 0,
    Eat = 1,
    Attack = 2,
    Consume = 3,
    Throw = 4,
    Shoot = 5,
    Place = 6,
    FillBottle = 7,
    FillBucket = 8,
    PourBucket = 9,
    UseTool = 10,
    Interact = 11,
    Retrieved = 12,
    Dyed = 13,
    Traded = 14,
    BrushingCompleted = 15,
    OpenedVault = 16
}

/**
 * The end of a use that takes time, such as finishing a drink or a meal.
 *
 * Bound to the client. The client starts the animation itself and keeps playing it until this
 * packet says the use is over.
 *
 * Wire order at protocol 2193: Item Id as an int16 in little-endian byte order, then Item Use
 * Method as an int32 in little-endian byte order (see {@link ItemUseMethod}).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/completed-using-item-packet/
 */
export default class CompletedUsingItemPacket extends DataPacket {
    public static NetID = Identifiers.CompletedUsingItemPacket;

    /** Item Id: the network id of the item that finished being used. */
    public itemId = 0;

    /** Item Use Method: which kind of use completed. */
    public itemUseMethod: ItemUseMethod = ItemUseMethod.EquipArmor;

    /** Reads the item id and the use method. */
    public decodePayload(): void {
        this.itemId = this.readShortLE();
        this.itemUseMethod = this.readIntLE();
    }

    /** Writes the item id and the use method. */
    public encodePayload(): void {
        this.writeShortLE(this.itemId);
        this.writeIntLE(this.itemUseMethod);
    }
}
