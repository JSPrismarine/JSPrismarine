/**
 * `UpdateClientInputLocksPacket`: Replaces the set of player inputs the client must ignore, such as
 * camera rotation, jumping or walking in one direction.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `UpdateClientInputLocksPacket` field list. */
export const updateClientInputLocksPacket = definePacket('UpdateClientInputLocksPacket', {
    /** `Input Lock ComponentData`, the full set of {@link ClientInputLock} bits now in force. */
    locks: t.varuint32
});

/** Replaces the set of player inputs the client must ignore, such as camera rotation, jumping or walking in one direction. */
export type UpdateClientInputLocksPayload = PayloadOf<typeof updateClientInputLocksPacket>;
