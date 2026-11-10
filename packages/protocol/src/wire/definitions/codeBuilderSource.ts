/**
 * `CodeBuilderSourcePacket`: An Education Edition request from the client's Code Builder webview to
 * the server.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CodeBuilderSourcePacket` field list. */
export const codeBuilderSourcePacket = definePacket('CodeBuilderSourcePacket', {
    /** `Operation`: what the client asks the code builder storage to do. */
    operation: t.uint8,
    /** `Category`: which stored value the operation targets. */
    category: t.uint8,
    /** `CodeStatus`: the execution state the client reports or sets. */
    codeStatus: t.uint8
});

/** An Education Edition request from the client's Code Builder webview to the server. */
export type CodeBuilderSourcePayload = PayloadOf<typeof codeBuilderSourcePacket>;
