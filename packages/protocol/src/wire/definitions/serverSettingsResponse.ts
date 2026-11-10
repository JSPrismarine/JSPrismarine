/**
 * `ServerSettingsResponsePacket`: The server's settings form, sent in reply to
 * `ServerSettingsRequestPacket`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-response-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ServerSettingsResponsePacket` field list. */
export const serverSettingsResponsePacket = definePacket('ServerSettingsResponsePacket', {
    /** Identifies the form in the client's reply. */
    formId: t.varuint32,
    /** The form description, as the JSON the client's UI engine expects. */
    formUiJson: t.string
});

/** The server's settings form, sent in reply to `ServerSettingsRequestPacket`. */
export type ServerSettingsResponsePayload = PayloadOf<typeof serverSettingsResponsePacket>;
