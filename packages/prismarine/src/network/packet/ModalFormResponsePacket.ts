import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Why a form closed without a response. */
export enum ModalFormCancelReason {
    UserClosed = 0,
    UserBusy = 1
}

/**
 * The client's answer to a `ModalFormRequestPacket`.
 *
 * Wire layout at protocol 2193: Form ID as a varuint32, JSON Response as an optional string
 * (a presence byte, then the JSON text), then Form Cancel Reason as an optional uint8. A
 * submitted form carries the JSON and no reason; a dismissed one carries the reason and no
 * JSON.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/modal-form-response-packet/
 */
export default class ModalFormResponsePacket extends DataPacket {
    public static NetID = Identifiers.ModalFormResponsePacket;

    /** The id the server chose when it sent the form. */
    public formId = 0;

    /** The response as JSON text, or `null` when the form was dismissed. */
    public jsonResponse: string | null = null;

    /** Why the form was dismissed, or `null` when it was submitted. */
    public formCancelReason: ModalFormCancelReason | null = null;

    /** Reads the id and the two optionals. */
    public decodePayload(): void {
        this.formId = this.readUnsignedVarInt();
        this.jsonResponse = this.readBoolean() ? NetworkUtil.readString(this) : null;
        this.formCancelReason = this.readBoolean() ? this.readByte() : null;
    }

    /** Writes the id and the two optionals. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.formId);
        this.writeBoolean(this.jsonResponse !== null);
        if (this.jsonResponse !== null) NetworkUtil.writeString(this, this.jsonResponse);
        this.writeBoolean(this.formCancelReason !== null);
        if (this.formCancelReason !== null) this.writeByte(this.formCancelReason);
    }
}
