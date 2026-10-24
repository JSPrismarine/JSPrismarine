import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The server's settings form, sent in reply to `ServerSettingsRequestPacket`.
 *
 * Same two fields as `ModalFormRequestPacket`, but the client puts the form in the settings
 * screen instead of showing it at once. The answer still comes back as a
 * `ModalFormResponsePacket` carrying the Form ID from here.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Form ID as a varuint32, then Form UI JSON as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-settings-response-packet/
 */
export default class ServerSettingsResponsePacket extends DataPacket {
    public static NetID = Identifiers.ServerSettingsResponsePacket;

    /** Identifies the form in the client's reply. */
    public formId = 0;

    /** The form description, as the JSON the client's UI engine expects. */
    public formUiJson = '';

    /** Reads the form id and its JSON. */
    public decodePayload(): void {
        this.formId = this.readUnsignedVarInt();
        this.formUiJson = NetworkUtil.readString(this);
    }

    /** Writes the form id and its JSON. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.formId);
        NetworkUtil.writeString(this, this.formUiJson);
    }
}
