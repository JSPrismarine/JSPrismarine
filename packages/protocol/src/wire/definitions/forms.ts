/**
 * The custom form packets: the screen the server asks for, and the answer that comes back.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ModalFormRequestPacket` field list. */
export const modalFormRequestPacket = definePacket('ModalFormRequestPacket', {
    /** `Form ID`: what ties the answer back to this request. */
    formId: t.varuint32,
    /** `Form UI JSON`: the whole screen, as the client's UI engine expects it. */
    formUiJson: t.string
});

/** What `ModalFormRequestPacket` carries. */
export type ModalFormRequestPayload = PayloadOf<typeof modalFormRequestPacket>;

/**
 * The `ModalFormResponsePacket` field list.
 *
 * A submitted form carries the JSON and no reason; a dismissed one carries the reason and no
 * JSON. The 1.26.51 metadata lists both as plain required fields, but the client has written
 * each behind a presence byte since 1.19.30, and the 1.26.60 preview changelog marks them
 * optional. The presence bytes are what a real client sends.
 */
export const modalFormResponsePacket = definePacket('ModalFormResponsePacket', {
    /** `Form ID`: the id the server chose when it sent the form. */
    formId: t.varuint32,
    /** `JSON Response`: the answer, or absent when the form was dismissed. */
    jsonResponse: t.optional(t.string),
    /** `Form Cancel Reason`: why it was dismissed, or absent when it was submitted. */
    formCancelReason: t.optional(t.uint8)
});

/** What `ModalFormResponsePacket` carries. */
export type ModalFormResponsePayload = PayloadOf<typeof modalFormResponsePacket>;
