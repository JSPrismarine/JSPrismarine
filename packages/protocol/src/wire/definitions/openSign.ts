/**
 * `OpenSignPacket`: tells the client to open the sign editing screen for one sign block.
 *
 * Protocol 2193 layout, in wire order: `Pos` as a block position (three ZigZag varint32), then
 * `Is Front Side` as one byte. The server sends it after a player interacts with a sign they
 * may edit; the client answers with a `BlockActorData` carrying the new text.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The `OpenSignPacket` field list; the module doc carries the wire layout. */
export const openSignPacket = definePacket('OpenSignPacket', {
    /** `Pos`: the sign block the client should open the editor for. */
    position: blockPosStructure,
    /** `Is Front Side`: edit the front face of the sign rather than the back. */
    isFrontSide: t.bool
});

/** The fields of an `OpenSignPacket`, in wire order. */
export type OpenSignPayload = PayloadOf<typeof openSignPacket>;
