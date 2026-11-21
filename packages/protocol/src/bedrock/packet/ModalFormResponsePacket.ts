import FieldNetworkPacket from '../../FieldNetworkPacket';
import { layoutAt } from '../../wire/WireLayout';
import { modalFormResponsePacket } from '../wire/definitions/forms';

/** Why a form closed without a response. */
export enum ModalFormCancelReason {
    UserClosed = 0,
    UserBusy = 1
}

/**
 * The client's answer to a `ModalFormRequestPacket`.
 *
 * Wire layout at protocols 2193 and 2225: Form ID as a varuint32, JSON Response as an optional string
 * (a presence byte, then the JSON text), then Form Cancel Reason as an optional uint8. A
 * submitted form carries the JSON and no reason; a dismissed one carries the reason and no
 * JSON.
 *
 * The 1.26.50 page lists both as plain fields, but the 1.26.60 page marks both optional, and its
 * changelog row says so. Mojang's note for that build says it corrected the docs to match the
 * engine, so the presence bytes are not a 2225 wire change and apply at 2193 too
 * (`docs/research/protocol-2225-delta.md`, the preview.21 paragraph). The same row changes JSON
 * Response from `Json::Value` to `string`; the wire carries JSON text either way. At 2193 the
 * pinned Bedrock Dedicated Server read this layout as the parity suite's `form-responses`
 * scenario records: a client sent it each answer with JSON, a reason, both or neither, and BDS
 * settled each form accordingly.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/modal-form-response-packet/
 */
export default class ModalFormResponsePacket extends FieldNetworkPacket {
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
