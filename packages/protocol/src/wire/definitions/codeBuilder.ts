/**
 * `CodeBuilderPacket`: Where the Code Builder websocket server lives, and whether to open the app
 * now.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/code-builder-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CodeBuilderPacket` field list. */
export const codeBuilderPacket = definePacket('CodeBuilderPacket', {
    /** URL of the Code Builder websocket server. */
    url: t.string,
    /** Should open code builder: true to bring the Code Builder app up straight away. */
    shouldOpenCodeBuilder: t.bool
});

/** Where the Code Builder websocket server lives, and whether to open the app now. */
export type CodeBuilderPayload = PayloadOf<typeof codeBuilderPacket>;
