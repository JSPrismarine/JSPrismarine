/**
 * `SetDefaultGameTypePacket`: Packet 105 on protocol 2193. Carries one field, `Default Game Type`,
 * as a varint32.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `SetDefaultGameTypePacket` field list. */
export const setDefaultGameTypePacket = definePacket('SetDefaultGameTypePacket', {
    /**
     * `Default Game Type`, a `Gametype` value written ZigZag encoded.
     * @defaultValue `Gametype.SURVIVAL`
     */
    gamemode: t.varint32
});

/** Packet 105 on protocol 2193. */
export type SetDefaultGameTypePayload = PayloadOf<typeof setDefaultGameTypePacket>;
