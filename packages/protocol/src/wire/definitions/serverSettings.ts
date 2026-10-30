/**
 * The client's request for the server settings form while it opens the settings screen.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-request-packet/}
 */
import { definePacket } from '../define';

import type { PayloadOf } from '../define';

/**
 * The `ServerSettingsRequestPacket` field list: empty.
 *
 * The client asks for the server's settings form while it sets up its settings screen, and
 * the packet arriving at all is the whole message. A server with a form to offer answers with
 * a `ServerSettingsResponsePacket`; one without answers nothing. The empty list is still a
 * definition so the registry accounts for the packet and the round-trip suite holds it to
 * writing no bytes, which is what a field appearing here by accident would break.
 */
export const serverSettingsRequestPacket = definePacket('ServerSettingsRequestPacket', {});

/** Requests the server's settings form; the packet's arrival carries the entire request. */
export type ServerSettingsRequestPayload = PayloadOf<typeof serverSettingsRequestPacket>;
