/**
 * `ServerStatsPacket`: Performance figures the server reports to the client.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ServerStatsPacket` field list. */
export const serverStatsPacket = definePacket('ServerStatsPacket', {
    /** `ServerTime`, how long the server spent on its last tick. */
    serverTime: t.lf32,
    /** `NetworkTime`, how long the server spent on networking in its last tick. */
    networkTime: t.lf32
});

/** Performance figures the server reports to the client. */
export type ServerStatsPayload = PayloadOf<typeof serverStatsPacket>;
