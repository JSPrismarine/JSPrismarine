/**
 * `AnvilDamagePacket`: the client asks for an anvil to be damaged after using it.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/anvil-damage-packet/}
 */
import BlockPos from '../../structure/BlockPos';
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** A `BlockPos` carried as the {@link BlockPos} structure class, so callers keep the class. */
const blockPosition = t.custom<BlockPos>(
    'BlockPos',
    (s, v) => v.write(s),
    (s) => {
        const position = new BlockPos(0, 0, 0);
        position.read(s);
        return position;
    }
);

/** The `AnvilDamagePacket` field list. */
export const anvilDamagePacket = definePacket('AnvilDamagePacket', {
    /** `Block Position`: the anvil position, three ZigZag varint32 coordinates. */
    blockPosition
});

/** Payload carried by `AnvilDamagePacket`. */
export type AnvilDamagePayload = PayloadOf<typeof anvilDamagePacket>;
