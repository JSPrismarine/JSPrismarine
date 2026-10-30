/**
 * The custom form packets: the screen the server asks the client to show.
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
