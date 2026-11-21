/**
 * `ClientboundDataDrivenUICloseScreenPacket`: closes one data-driven UI screen, or all of them.
 *
 * Protocol 2193 layout: `FormId` is an optional, one presence byte followed by a little-endian
 * uint32 when the byte is 0x01. A packet whose presence byte is 0x00 closes every open
 * data-driven screen.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields sent when the server closes data-driven UI screens. */
export const clientboundDataDrivenUICloseScreenPacket = definePacket('ClientboundDataDrivenUICloseScreenPacket', {
    /** `FormId`: the one screen to close. `undefined` closes every data-driven screen. */
    formId: t.present(t.lu32)
});

/** Payload carried by `ClientboundDataDrivenUICloseScreenPacket`. */
export type ClientboundDataDrivenUICloseScreenPayload = PayloadOf<typeof clientboundDataDrivenUICloseScreenPacket>;
