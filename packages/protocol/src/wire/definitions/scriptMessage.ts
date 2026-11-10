/**
 * `ScriptMessagePacket`: A custom message between the client's and the server's scripts.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ScriptMessagePacket` field list. */
export const scriptMessagePacket = definePacket('ScriptMessagePacket', {
    /** `Message Id`: the event name a script listens for, by convention `namespace:name`. */
    messageId: t.string,
    /** `Message Value`: the payload, an arbitrary string the scripts on both ends agree on. */
    messageValue: t.string
});

/** A custom message between the client's and the server's scripts. */
export type ScriptMessagePayload = PayloadOf<typeof scriptMessagePacket>;
