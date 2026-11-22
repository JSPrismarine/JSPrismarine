import { completedUsingItemPacket } from '../wire/definitions/completedUsingItem';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * How an item was used, as the Item Use Method int32 numbers it.
 *
 * Mojang's pages for protocols 2193 and 2225 leave the field a bare int32 and list no members.
 * The values are those of `ItemUseMethod` in the pinned 1.26.40 dump
 * `packages/minecraft/datagen/snapshot/0e00fe80f4f3-enums.html`, which
 * `CompletedUsingItemPacket.test.ts` checks them against.
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
 * Wire order: Item Id as an int16 in little-endian byte order, then Item Use
 * Method as an int32 in little-endian byte order (see {@link ItemUseMethod}).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/completed-using-item-packet/
 */
export default class CompletedUsingItemPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CompletedUsingItemPacket';
    }

    /** Item Id: the network id of the item that finished being used. */
    public itemId = 0;

    /** Item Use Method: which kind of use completed. */
    public itemUseMethod: ItemUseMethod = ItemUseMethod.EquipArmor;

    /** Reads the item id and the use method. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(completedUsingItemPacket, this.codecProtocol).decode(this));
    }

    /** Writes the item id and the use method. */
    public encodePayload(): void {
        layoutAt(completedUsingItemPacket, this.codecProtocol).encode(this, this);
    }
}
