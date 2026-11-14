/**
 * `BlockEventPacket`: synchronizes a block-defined event between server and client.
 *
 * The payload is a block position followed by two opaque ZigZag varint32 integers, `Event Type`
 * and `Event Value`, whose meaning belongs to the block at that position.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/block-event-packet/
 */
import BlockPos from '../../structure/BlockPos';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** `BlockPos` as the package's {@link BlockPos} class, so payloads keep their class type. */
const blockPosition: WireType<BlockPos> = t.custom(
    'BlockPos',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        return position;
    }
);

/** The fields sent when a block reports one block-defined event. */
export const blockEventPacket = definePacket('BlockEventPacket', {
    /** `Block Position`: where the event happened. */
    blockPosition,
    /** `Event Type`: interpreted by the block at `blockPosition`. */
    eventType: t.varint32,
    /** `Event Value`: interpreted together with `eventType`. */
    eventValue: t.varint32
});

/** Payload carried by `BlockEventPacket`. */
export type BlockEventPayload = PayloadOf<typeof blockEventPacket>;
