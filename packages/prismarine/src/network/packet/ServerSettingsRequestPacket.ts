import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The client asking for the server's settings form, sent while it sets up its settings
 * screen.
 *
 * The packet has no payload. A server with a form to offer answers with a
 * `ServerSettingsResponsePacket`; one without answers nothing.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-request-packet/
 */
export default class ServerSettingsRequestPacket extends DataPacket {
    public static NetID = Identifiers.ServerSettingsRequestPacket;
}
