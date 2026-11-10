/**
 * `SimpleEventPacket`: Asks the server to turn commands on or off, or to unlock the world template
 * settings.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/simple-event-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `SimpleEventPacket` field list. */
export const simpleEventPacket = definePacket('SimpleEventPacket', {
    /** Type, the request being made. */
    type: t.lu16
});

/** Asks the server to turn commands on or off, or to unlock the world template settings. */
export type SimpleEventPayload = PayloadOf<typeof simpleEventPacket>;
