import type { Vector3 } from '@jsprismarine/math';
import { ActorEvent } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * One-off things that happen to an entity and that the client animates itself: the red
 * flash of being hurt, the death spin, an arm swing.
 *
 * Health arriving as a smaller number is not enough on its own - the client will move the
 * hearts and say nothing about it. The flash and the sound come from here.
 *
 * Protocol 2193 wire order, with the docs' field names: `Target Runtime ID` (varuint64),
 * `Event ID` (uint8, an `ActorEvent`), `Data` (ZigZag varint32), then `Fire At Position` as
 * an optional Vec3 - a presence byte, then three little-endian floats when it is 0x01.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/actor-event-packet/
 */
export default class ActorEventPacket extends DataPacket {
    public static NetID = Identifiers.ActorEventPacket;

    public runtimeEntityId!: bigint;
    public event!: ActorEvent;

    /** `Data`. Meaning depends on the event; zero for the ones that carry nothing. */
    public data: number = 0;

    /**
     * `Fire At Position`: where the event happens, when that is somewhere other than the
     * entity. Null leaves the optional absent, and the entity's own position is used.
     */
    public fireAtPosition: Vector3 | null = null;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeByte(this.event);
        this.writeVarInt(this.data);

        // The presence byte of `Fire At Position` goes out whether or not a position follows.
        // Leaving it out ends the packet a byte early, and a client that reads past the end of
        // a packet treats it as malformed and drops the connection with `initialconnection-90`.
        // One of these goes out the moment anything takes damage.
        this.writeBoolean(this.fireAtPosition !== null);
        if (this.fireAtPosition !== null) NetworkUtil.writeVector3(this, this.fireAtPosition);
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.event = this.readByte();
        this.data = this.readVarInt();
        this.fireAtPosition = this.readBoolean() ? NetworkUtil.readVector3(this) : null;
    }
}

/**
 * The events this packet can carry. Only the handful the server has a use for; the protocol
 * defines a long tail of mob-specific ones.
 */
// `ActorEvent` is generated and lives in `@jsprismarine/minecraft`. The copy here carried
// five of its fifty-eight members, and called 4 ARM_SWING where vanilla calls it
// StartAttacking.
export { ActorEvent };
