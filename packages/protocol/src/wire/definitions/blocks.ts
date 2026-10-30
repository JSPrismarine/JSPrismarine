/**
 * The packets that change one block, or one block actor's data.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `UpdateBlockPacket` field list. */
export const updateBlockPacket = definePacket('UpdateBlockPacket', {
    /** `Block Position`: where the block stands. Signed in all three coordinates. */
    position: t.blockPos,
    /** `Block Runtime ID`: the hashed id of the state that now stands there. */
    blockRuntimeId: t.varuint32,
    /** `Flags`: vanilla's `BlockUpdateFlag` bits. */
    flags: t.varuint32,
    /** `Layer`: 0 the block itself, 1 the waterlogging layer. */
    layer: t.varuint32
});

/** What `UpdateBlockPacket` carries. */
export type UpdateBlockPayload = PayloadOf<typeof updateBlockPacket>;
