/**
 * `LevelEventPacket`: tells the client what happened in the world and where.
 *
 * The event number selects the client-side behavior, while `Data` supplies any event-specific
 * value. The payload is `Event Id` as a ZigZag varint32, `Position` as three little-endian
 * floats, and `Data` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/level-event-packet/
 */
import Vec3 from '../../structure/Vec3';
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** `Vec3` that accepts `null` when writing, which goes out as the origin the global events use. */
const eventPosition = t.custom<Vec3 | null>(
    'Vec3',
    (stream, value) => vec3Structure.write(stream, value ?? new Vec3(0, 0, 0)),
    (stream) => vec3Structure.read(stream)
);

/** The fields sent when a world event happens. */
export const levelEventPacket = definePacket('LevelEventPacket', {
    /** `Event Id`: the client selects its sound, particles, or other effect from this. */
    eventId: t.varint32,
    /** `Position`: where the event happens; `null` is written as the origin. */
    position: eventPosition,
    /** `Data`: an event-specific value, such as the block runtime id for a block-breaking effect. */
    data: t.varint32
});

/** Payload carried by `LevelEventPacket`. */
export type LevelEvent = PayloadOf<typeof levelEventPacket>;
