/**
 * `RecordStartedPacket`: tells the client a record started playing at a block, such as a disc put
 * into a jukebox.
 *
 * Protocol 2193 layout, in wire order: `Block Position` as three ZigZag varint32, then
 * `Server Sound Handle` as a little-endian uint64.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent when a record starts playing at a block. */
export const recordStartedPacket = definePacket('RecordStartedPacket', {
    /** `Block Position`: the jukebox the record plays from. */
    position: blockPosStructure,
    /** `Server Sound Handle`: the `ServerSoundHandle` a later `ClientboundUpdateSoundDataPacket` can change the sound by. */
    serverSoundHandle: t.lu64
});

/** Payload carried by `RecordStartedPacket`. */
export type RecordStartedPayload = PayloadOf<typeof recordStartedPacket>;
