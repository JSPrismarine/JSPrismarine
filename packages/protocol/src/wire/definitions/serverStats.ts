/**
 * `ServerStatsPacket`: Performance figures the server reports to the client.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ServerStatsPacket` field list. */
export const serverStatsPacket = definePacket('ServerStatsPacket', {
    /** `ServerTime`, a little-endian 32-bit float. The docs give no unit. */
    serverTime: t.lf32,
    /** `NetworkTime`, a little-endian 32-bit float. The docs give no unit. */
    networkTime: t.lf32
});

/** Performance figures the server reports to the client. */
export type ServerStatsPayload = PayloadOf<typeof serverStatsPacket>;
