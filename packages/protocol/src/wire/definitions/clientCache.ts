/**
 * `ClientCacheStatusPacket`: whether the client keeps a blob cache of chunk and block entity
 * data. Sent once after login, unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-cache-status-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ClientCacheStatusPacket` field list. */
export const clientCacheStatusPacket = definePacket('ClientCacheStatusPacket', {
    /** `Is cache supported?`: whether the client offers to keep a blob cache. */
    enabled: t.bool
});

/** What `ClientCacheStatusPacket` carries; derived from the field list. */
export type ClientCacheStatusPayload = PayloadOf<typeof clientCacheStatusPacket>;
