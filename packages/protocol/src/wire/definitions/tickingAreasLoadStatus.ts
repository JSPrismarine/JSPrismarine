/**
 * `TickingAreasLoadStatusPacket`: Whether the client is sitting on a loading screen waiting for
 * ticking areas to preload.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/ticking-areas-load-status-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `TickingAreasLoadStatusPacket` field list. */
export const tickingAreasLoadStatusPacket = definePacket('TickingAreasLoadStatusPacket', {
    /** Waiting For Preload: `true` while the client is still waiting on the preload. */
    preload: t.bool
});

/** Whether the client is sitting on a loading screen waiting for ticking areas to preload. */
export type TickingAreasLoadStatusPayload = PayloadOf<typeof tickingAreasLoadStatusPacket>;
