/**
 * `ClientboundDataDrivenUIShowScreenPacket`: tells the client to open a data-driven UI screen.
 *
 * The payload is the screen id, the form id, and an optional data instance id, in the order
 * the docs list them, the same at protocols 2193 and 2225. The client answers with `ServerboundDataDrivenScreenClosedPacket`
 * once the screen goes away.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields sent when the client opens one data-driven UI screen. */
export const clientboundDataDrivenUIShowScreenPacket = definePacket('ClientboundDataDrivenUIShowScreenPacket', {
    /** `ScreenId`: which data-driven screen to show, as a varuint32 byte length followed by UTF-8. */
    screenId: t.string,
    /** `FormId`: the id of this instance of the form, which scripting uses to track it, as a little-endian uint32. */
    formId: t.lu32,
    /** `DataInstanceId`: the id of the data bound to this screen, as an optional little-endian uint32. `undefined` when the screen has none. */
    dataInstanceId: t.present(t.lu32)
});

/** Payload carried by `ClientboundDataDrivenUIShowScreenPacket`. */
export type ClientboundDataDrivenUIShowScreenPayload = PayloadOf<typeof clientboundDataDrivenUIShowScreenPacket>;
