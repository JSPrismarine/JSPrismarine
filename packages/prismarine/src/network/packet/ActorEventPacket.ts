import { ActorEvent } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * One-off things that happen to an entity and that the client animates itself: the red
 * flash of being hurt, the death spin, an arm swing.
 *
 * Health arriving as a smaller number is not enough on its own - the client will move the
 * hearts and say nothing about it. The flash and the sound come from here.
 * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json `packet_entity_event`
 */
export default class ActorEventPacket extends DataPacket {
    public static NetID = Identifiers.ActorEventPacket;

    public runtimeEntityId!: bigint;
    public event!: ActorEvent;

    /** Meaning depends on the event; zero for the ones that carry nothing. */
    public data: number = 0;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeByte(this.event);
        this.writeVarInt(this.data);

        // The position a `fire at` event points to, optional and new to this protocol: a byte
        // saying whether it is there, then a Vec3 if it is. Nothing here raises one, but the byte
        // is not optional - leaving it out ends the packet a byte early, and a client that reads
        // past the end of a packet treats it as malformed and drops the connection with
        // `initialconnection-90`. One of these goes out the moment anything takes damage.
        this.writeBoolean(false);
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.event = this.readByte();
        this.data = this.readVarInt();
        if (this.readBoolean()) {
            this.readFloatLE();
            this.readFloatLE();
            this.readFloatLE();
        }
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
