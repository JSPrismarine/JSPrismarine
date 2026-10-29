import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * A custom form for the client to show, answered by `ModalFormResponsePacket`.
 *
 * Vanilla never sends it. The JSON describes the whole screen, and the Form ID is what ties the
 * answer back to the request, so it has to be unique among the forms a session has open.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Form ID as a varuint32, then Form UI JSON as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/modal-form-request-packet/
 */
export default class ModalFormRequestPacket extends DataPacket {
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
