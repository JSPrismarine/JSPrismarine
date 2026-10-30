import { layoutAt, modalFormResponsePacket } from '@jsprismarine/protocol';

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
 *
 * The 1.26.51 metadata lists both as plain required fields, but the client has written each
 * behind a presence byte since 1.19.30, and the 1.26.60 preview changelog marks them
 * optional. The presence bytes are what a real client sends, so they stay.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/modal-form-response-packet/
 */
export default class ModalFormResponsePacket extends DataPacket {
    /** The id the server chose when it sent the form. */
    public formId = 0;

    /** The response as JSON text, or `null` when the form was dismissed. */
    public jsonResponse: string | null = null;

    /** Why the form was dismissed, or `null` when it was submitted. */
    public formCancelReason: ModalFormCancelReason | null = null;

    /** Reads the id and the two optionals. */
    public decodePayload(): void {
        const read = layoutAt(modalFormResponsePacket, this.codecProtocol).decode(this);
        this.formId = read.formId;
        this.jsonResponse = read.jsonResponse;
        this.formCancelReason = read.formCancelReason;
    }

    /** Writes the id and the two optionals. */
    public encodePayload(): void {
        layoutAt(modalFormResponsePacket, this.codecProtocol).encode(this, {
            formId: this.formId,
            jsonResponse: this.jsonResponse,
            formCancelReason: this.formCancelReason
        });
    }
}
