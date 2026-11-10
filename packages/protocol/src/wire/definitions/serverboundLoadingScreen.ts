/**
 * `ServerboundLoadingScreenPacket`: Reports a loading screen starting or ending on the client.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ServerboundLoadingScreenPacket` field list. */
export const serverboundLoadingScreenPacket = definePacket('ServerboundLoadingScreenPacket', {
    /** `Loading Screen Type`: start or end. */
    loadingScreenType: t.varint32,
    /** `Loading Screen Id`: the screen the report is about, or `null` when absent. */
    loadingScreenId: t.optional(t.lu32)
});

/** Reports a loading screen starting or ending on the client. */
export type ServerboundLoadingScreenPayload = PayloadOf<typeof serverboundLoadingScreenPacket>;
