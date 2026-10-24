import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * A level event whose payload is too large for `LevelEventPacket`'s single position and data
 * word.
 *
 * The event data is network little-endian NBT, and its fields depend entirely on the Event Id.
 * Every event carries `originX`, `originY` and `originZ`, which stand in for the position
 * field this packet does not have.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Event Id as a ZigZag varint32, then the event data to the end
 * of the packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/level-event-generic-packet/
 */
export default class LevelEventGenericPacket extends DataPacket {
    public static NetID = Identifiers.LevelEventGenericPacket;

    /** Which event this is, and so what the data holds. */
    public eventId = 0;

    /**
     * The event data, kept as the raw bytes.
     *
     * Not a compound: the tags are written loose, with no opening `TAG_Compound` and no
     * closing `TAG_End`, so the NBT reader cannot be pointed at them as they stand. Nothing in
     * this server builds one of these events, so the bytes are carried through untouched.
     */
    public serializedEventData: Buffer = Buffer.alloc(0);

    /** Reads the event id and the rest of the packet as the event data. */
    public decodePayload(): void {
        this.eventId = this.readVarInt();
        this.serializedEventData = this.readRemaining();
    }

    /** Writes the event id and the event data. */
    public encodePayload(): void {
        this.writeVarInt(this.eventId);
        this.write(this.serializedEventData);
    }
}
