import { layoutAt, levelEventGenericPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

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
 * Protocol 2193 layout (docs id 124), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Event Id | varint32 | ZigZag |
 * | Event data | headless compound | The docs type it `unknown`; see {@link serializedEventData} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-event-generic-packet/
 */
export default class LevelEventGenericPacket extends FieldNetworkPacket {
    /** Which event this is, and so what the data holds. */
    public eventId = 0;

    /**
     * The event data, kept as the raw bytes.
     *
     * A compound written headless: its named entries and the closing `TAG_End`, with no type
     * byte and no root name in front, which is what vanilla's `CompoundTag::write` produces
     * and what PocketMine reads back with `readHeadless`. The NBT reader here only parses a
     * full named compound, so to decode these prepend `0x0a 0x00` (`TAG_Compound`, empty
     * name). Nothing in this server builds one of these events, so the bytes are carried
     * through untouched.
     */
    public serializedEventData: Buffer = Buffer.alloc(0);

    /** Reads the event id and the rest of the packet as the event data. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(levelEventGenericPacket, this.codecProtocol).decode(this));
    }

    /** Writes the event id and the event data. */
    public encodePayload(): void {
        layoutAt(levelEventGenericPacket, this.codecProtocol).encode(this, this);
    }
}
