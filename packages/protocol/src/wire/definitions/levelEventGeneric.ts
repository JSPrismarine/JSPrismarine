/**
 * `LevelEventGenericPacket` described as a declarative field list; layout unchanged between
 * protocols 2193 and 2225.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-event-generic-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * `Event data`: network little-endian NBT carried as raw bytes to the end of the packet.
 *
 * A compound written headless: its named entries and the closing `TAG_End`, with no type byte
 * and no root name in front, which is what vanilla's `CompoundTag::write` produces and what
 * PocketMine reads back with `readHeadless`. Nothing in this server builds one of these
 * events, so the bytes travel untouched.
 */
const headlessCompound = t.custom<Buffer>(
    'HeadlessCompound',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/**
 * The `LevelEventGenericPacket` field list: a level event whose payload is too large for
 * `LevelEventPacket`'s single position and data word. Every event's data carries `originX`,
 * `originY` and `originZ`, which stand in for the position field this packet does not have.
 */
export const levelEventGenericPacket = definePacket('LevelEventGenericPacket', {
    /** `Event Id`: which event this is, and so what the data holds. */
    eventId: t.varint32,
    /** `Event data`: the docs type it `unknown`; see {@link headlessCompound}. */
    serializedEventData: headlessCompound
});
