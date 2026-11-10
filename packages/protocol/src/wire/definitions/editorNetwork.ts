/**
 * `EditorNetworkPacket`: Carries an opaque Bedrock Editor payload between an editor client and an
 * editor server. The protocol does not interpret the payload; the named variant type on each side
 * does.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `EditorNetworkPacket` field list. */
export const editorNetworkPacket = definePacket('EditorNetworkPacket', {
    /** `Route To Manager`: deliver the payload to the editor's network manager instead of the default receiver. */
    routeToManager: t.bool,
    /** `Raw Variant Name`, the name of the `IEditorNetworkPayload` type that produced the data. */
    rawVariantName: t.string,
    /** `Raw Variant Data`, the payload serialized by that type. Opaque to the protocol. */
    rawVariantData: t.string
});

/** Carries an opaque Bedrock Editor payload between an editor client and an editor server. */
export type EditorNetworkPayload = PayloadOf<typeof editorNetworkPacket>;
