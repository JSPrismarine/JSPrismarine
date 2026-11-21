import { ItemStackResponseResult } from '@jsprismarine/minecraft';
import { itemStackResponsePacket } from '../wire/definitions/itemStackResponse';
import { layoutAt } from '../../wire/WireLayout';
import FieldNetworkPacket from '../../FieldNetworkPacket';

import type {
    ItemStackResponse,
    ItemStackResponseContainerInfo,
    ItemStackResponseSlotInfo
} from '../wire/definitions/itemStackResponse';

// `ItemStackResponseResult` is generated from Mojang's documentation, where it is
// `ItemStackNetResult`. It carries sixty-eight reasons a request can fail; this server sends
// two of them, and every refusal it makes could be naming one of the rest.
export { ItemStackResponseResult };
export type { ItemStackResponse, ItemStackResponseContainerInfo, ItemStackResponseSlotInfo };

/**
 * The answer to an {@link ItemStackRequestPacket}.
 *
 * A rejected request carries no containers - the client already knows what to put back - so
 * only an accepted one describes slots.
 *
 * Wire order at protocol 2193 is `Responses`, a varuint count then one `ItemStackResponseInfo`
 * each: `Result` (uint8), `Client Request Id` (varint32), and `Containers` as an optional array
 * of `ItemStackResponseContainerInfo`, each a `Full Container Name` (a uint8 and an optional
 * uint32 LE `Dynamic ID`) and a varuint counted list of `ItemStackResponseSlotInfo`. A slot is
 * `Requested Slot` (uint8), `Slot` (uint8), `Amount` (uint8), `Item Stack Net Id` (optional
 * varint32), `Custom Name` (an `Unredacted` string and an optional `Redacted` string), and
 * `Durability Correction` (varint32).
 *
 * The two optionals are tied to other fields rather than to whether there is anything to
 * write. Mojang's 2193 note: `Containers` carries a value exactly when `Result` is `Success`,
 * so an accepted request that changed nothing still carries an empty list; and `Item Stack
 * Net Id` carries a value exactly when `Amount` is above zero. The presence byte is written
 * either way. 2168 wrote each of those presence bytes twice; 2193 took the redundant one out.
 *
 * Protocol 2225 keeps this layout.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/item-stack-response-packet/
 */
export default class ItemStackResponsePacket extends FieldNetworkPacket {
    public responses: ItemStackResponse[] = [];

    /**
     * Writes Responses in docs order; see the class comment for the layout.
     * @throws {RangeError} when a slot's durability correction does not fit an int16.
     */
    public encodePayload(): void {
        layoutAt(itemStackResponsePacket, this.codecProtocol).encode(this, this);
    }

    /**
     * Reads Responses back, the mirror of {@link encodePayload}.
     */
    public decodePayload(): void {
        Object.assign(this, layoutAt(itemStackResponsePacket, this.codecProtocol).decode(this));
    }
}
