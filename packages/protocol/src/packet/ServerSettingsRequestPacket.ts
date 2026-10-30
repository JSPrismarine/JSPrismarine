import { serverSettingsRequestPacket } from '../wire/definitions/serverSettings';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * The client asking for the server's settings form, sent while it sets up its settings
 * screen.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `serverSettingsRequestPacket`
 * definition, which has no fields: the packet arriving at all is the whole message. A server
 * with a form to offer answers with a `ServerSettingsResponsePacket`; one without answers
 * nothing.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-request-packet/
 */
export default class ServerSettingsRequestPacket extends FieldNetworkPacket {
    /** Reads the empty payload, which consumes no bytes. */
    public decodePayload(): void {
        layoutAt(serverSettingsRequestPacket, this.codecProtocol).decode(this);
    }

    /** Writes the empty payload, which produces no bytes. */
    public encodePayload(): void {
        layoutAt(serverSettingsRequestPacket, this.codecProtocol).encode(this, {});
    }
}
