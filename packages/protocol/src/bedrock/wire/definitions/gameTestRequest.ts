/**
 * `GameTestRequestPacket`: a client's request to run a GameTest (the `/gametest run` family of
 * commands).
 *
 * Protocol 2193 layout, in wire order: `MaxTestsPerBatch` and `RepeatCount` as ZigZag varint32,
 * `Rotation` as one byte, `StopOnFailure` as one byte, `TestPos` as a `BlockPos` (three ZigZag
 * varint32), `TestsPerRow` as a ZigZag varint32, then `TestName` as a varuint32 byte length
 * followed by UTF-8. The server answers with a `GameTestResultsPacket` once the test finishes.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { Rotation } from '../../packet/GameTestRequestPacket';
import type { PayloadOf } from '../../../wire/define';

/** The `GameTestRequestPacket` field list. */
export const gameTestRequestPacket = definePacket('GameTestRequestPacket', {
    /** `MaxTestsPerBatch`, how many tests may run at once. */
    maxTestsPerBatch: t.varint32,
    /** `RepeatCount`, how many times to run each test. */
    repeatCount: t.varint32,
    /** `Rotation` to place the test structure with, one byte. */
    rotation: t.enumOf<Rotation>(t.uint8),
    /** `StopOnFailure`: stop the batch at the first failed test. */
    stopOnFailure: t.bool,
    /** `TestPos`, the block the first test structure is placed at. */
    testPosition: blockPosStructure,
    /** `TestsPerRow`, how many test structures to lay out before starting a new row. */
    testsPerRow: t.varint32,
    /** `TestName`, the GameTest to run, for example `farm:crops`. */
    testName: t.string
});

/** The fields of a `GameTestRequestPacket`, in wire order. */
export type GameTestRequestPayload = PayloadOf<typeof gameTestRequestPacket>;
