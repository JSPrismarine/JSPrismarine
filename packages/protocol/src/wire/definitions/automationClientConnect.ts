/**
 * `AutomationClientConnectPacket`: Tells the client to open a websocket connection to the given
 * address.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/automation-client-connect-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `AutomationClientConnectPacket` field list. */
export const automationClientConnectPacket = definePacket('AutomationClientConnectPacket', {
    /** The address the client connects to, without a scheme. */
    websocketServerUri: t.string
});

/** Tells the client to open a websocket connection to the given address. */
export type AutomationClientConnectPayload = PayloadOf<typeof automationClientConnectPacket>;
