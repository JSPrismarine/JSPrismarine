/**
 * `GameTestResultsPacket`: The outcome of a GameTest the client asked for with a
 * `GameTestRequestPacket`.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `GameTestResultsPacket` field list. */
export const gameTestResultsPacket = definePacket('GameTestResultsPacket', {
    /** `Succeeded`: the test passed. */
    succeeded: t.bool,
    /** `Error`, why the test failed. Empty when it passed. */
    error: t.string,
    /** `TestName`, the GameTest this result is for, as the request named it. */
    testName: t.string
});

/** The outcome of a GameTest the client asked for with a `GameTestRequestPacket`. */
export type GameTestResultsPayload = PayloadOf<typeof gameTestResultsPacket>;
