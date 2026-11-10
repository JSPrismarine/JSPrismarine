/**
 * `MapCreateLockedCopyPacket`: A map being locked at a cartography table.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/map-create-locked-copy-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `MapCreateLockedCopyPacket` field list. */
export const mapCreateLockedCopyPacket = definePacket('MapCreateLockedCopyPacket', {
    /** Id of the map being copied. */
    originalMapId: t.varint64,
    /** Id the locked copy should be given. */
    newMapId: t.varint64
});

/** A map being locked at a cartography table. */
export type MapCreateLockedCopyPayload = PayloadOf<typeof mapCreateLockedCopyPacket>;
