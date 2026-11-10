import { actorPickRequestPacket } from '../wire/definitions/actorPickRequest';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * A creative player middle-clicking an actor to get its spawn egg.
 *
 * Wire layout at protocol 2193: Actor ID as an int64 LE (a unique id written fixed width),
 * Max Slots as a uint8 (empty hotbar slots), then With Data as a boolean (whether to copy
 * the actor's NBT). The flag order differs from `BlockPickRequestPacket`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/actor-pick-request-packet/
 */
export default class ActorPickRequestPacket extends FieldNetworkPacket {
    /** Unique id of the picked actor. */
    public actorId = 0n;

    /** Empty hotbar slots, which decides whether the pick replaces the held item. */
    public maxSlots = 0;

    /** `true` when the client wants the actor's data on the egg. */
    public withData = false;

    /** Reads the id, the slot count, and the data flag. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(actorPickRequestPacket, this.codecProtocol).decode(this));
    }

    /** Writes the id, the slot count, and the data flag. */
    public encodePayload(): void {
        layoutAt(actorPickRequestPacket, this.codecProtocol).encode(this, this);
    }
}
