import FieldNetworkPacket from '../FieldNetworkPacket';
import { NetworkUtil } from '../wire/networkUtil';

/**
 * Tells the client to open a websocket connection to the given address.
 *
 * The websocket server on the other end can run commands as the player and subscribe to the
 * client's events. Education Edition uses it for companion apps; the `/wsserver` command
 * sends the same packet.
 *
 * Wire order at protocol 2193: `Web Socket Data`, which is one field,
 * `Websocket Server URI`, as a string. An address such as `localhost:8000/ws`.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/automation-client-connect-packet/
 */
export default class AutomationClientConnectPacket extends FieldNetworkPacket {
    /** The address the client connects to, without a scheme. */
    public websocketServerUri = '';

    /** Reads the websocket address. */
    public decodePayload(): void {
        this.websocketServerUri = NetworkUtil.readString(this);
    }

    /** Writes the websocket address. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.websocketServerUri);
    }
}
