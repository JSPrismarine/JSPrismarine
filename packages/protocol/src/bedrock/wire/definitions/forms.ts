/**
 * The custom form packets: the screen the server asks for, and the answer that comes back.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `ModalFormRequestPacket` field list. */
export const modalFormRequestPacket = definePacket('ModalFormRequestPacket', {
    /** `Form ID`: what ties the answer back to this request. */
    formId: t.varuint32,
    /** `Form UI JSON`: the whole screen, as the client's UI engine expects it. */
    formUiJson: t.string
});

/** Sends a custom form id and the JSON document that defines the client's form UI. */
export type ModalFormRequestPayload = PayloadOf<typeof modalFormRequestPacket>;

/**
 * The `ModalFormResponsePacket` field list.
 *
 * A submitted form carries the JSON and no reason; a dismissed one carries the reason and no
 * JSON. The 1.26.50 page lists both as plain fields and the 1.26.60 page marks both optional;
 * Mojang's note for that build says it corrected the docs to the engine, so both versions keep
 * the presence bytes (`docs/research/protocol-2225-delta.md`).
 */
export const modalFormResponsePacket = definePacket('ModalFormResponsePacket', {
    /** `Form ID`: the id the server chose when it sent the form. */
    formId: t.varuint32,
    /** `JSON Response`: the answer, or absent when the form was dismissed. */
    jsonResponse: t.optional(t.string),
    /** `Form Cancel Reason`: why it was dismissed, or absent when it was submitted. */
    formCancelReason: t.optional(t.uint8)
});

/** Returns a form submission or a cancellation reason for the requested form id. */
export type ModalFormResponsePayload = PayloadOf<typeof modalFormResponsePacket>;
