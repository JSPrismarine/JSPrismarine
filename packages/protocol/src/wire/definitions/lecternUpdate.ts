/**
 * `LecternUpdatePacket`: the client tells the server which page a lectern shows.
 *
 * Protocols 2193 and 2225 share one layout: `New page to show` (uint8), `Total Pages` (uint8),
 * then `Position of Lectern to update` as three ZigZag varint32 coordinates.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/lectern-update-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent when a player turns to a page in a lectern book. */
export const lecternUpdatePacket = definePacket('LecternUpdatePacket', {
    /** `New page to show`: zero-based page the client wants shown. */
    newPage: t.uint8,
    /** `Total Pages`: number of pages in the book, as the client sees it. */
    totalPages: t.uint8,
    /** `Position of Lectern to update`: position of the lectern, encoded as a signed `BlockPos`. */
    position: blockPosStructure
});

/** Payload carried by `LecternUpdatePacket`. */
export type LecternUpdate = PayloadOf<typeof lecternUpdatePacket>;
