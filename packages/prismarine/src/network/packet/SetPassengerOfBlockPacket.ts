import { layoutAt, setPassengerOfBlockPacket } from '@jsprismarine/protocol';
import type { PassengerOfBlock } from '@jsprismarine/protocol/wire/structures/PassengerOfBlock';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Seats an actor on a block, or takes it off one when the data is absent.
 *
 * Added at protocol 2225 (Minecraft 1.26.60); the layout lives in `@jsprismarine/protocol`'s
 * declarative definition, read off Mojang's v1.26.60 release schemas. A codec older than 2225
 * has no id for it, so only a 2225 session ever builds one.
 *
 * @see `docs/research/protocol-2225-added-packets.md`
 */
export default class SetPassengerOfBlockPacket extends FieldNetworkPacket {
    /** `passenger`. */
    public passenger: bigint = 0n;

    /** `passengerOfBlockData`. */
    public passengerOfBlockData: PassengerOfBlock | null = null;
    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(setPassengerOfBlockPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(setPassengerOfBlockPacket, this.codecProtocol).decode(this));
    }
}
