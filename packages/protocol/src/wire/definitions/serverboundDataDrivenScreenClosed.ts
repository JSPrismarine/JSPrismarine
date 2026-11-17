/**
 * `ServerboundDataDrivenScreenClosedPacket`: the client's report that a data-driven UI screen
 * closed, whether the server asked for it or the player dismissed it.
 *
 * Protocol 2193 layout, in wire order: `FormId` as a little-endian uint32, then `CloseReason`
 * as a string holding a lowercase {@link DataDrivenScreenClosedReason} member name. Decoding
 * throws when the string is not a member the schema lists.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * The docs' `DataDrivenScreenClosedReason`. The schema gives the field no `Enum-as-Value`
 * option, so the member name travels as a lowercase string rather than its number. The
 * datagen snapshot numbers the members 0 to 4 in this order; those numbers never reach the
 * wire. The strings match what gophertunnel and PocketMine read from real clients.
 */
export enum DataDrivenScreenClosedReason {
    /** Docs: `ProgrammaticClose` (0). The server closed this one screen. */
    ProgrammaticClose = 'programmaticclose',
    /** Docs: `ProgrammaticCloseAll` (1). The server closed every screen. */
    ProgrammaticCloseAll = 'programmaticcloseall',
    /** Docs: `ClientCanceled` (2). The player dismissed the screen. */
    ClientCanceled = 'clientcanceled',
    /** Docs: `UserBusy` (3). The client could not show the screen because another one was open. */
    UserBusy = 'userbusy',
    /** Docs: `InvalidForm` (4). The client could not show the screen it was asked for. */
    InvalidForm = 'invalidform'
}

const CLOSE_REASONS = new Set<string>(Object.values(DataDrivenScreenClosedReason));

const isCloseReason = (value: string): value is DataDrivenScreenClosedReason => CLOSE_REASONS.has(value);

/** `CloseReason`: a string that must name a {@link DataDrivenScreenClosedReason} member. */
const closeReason = t.custom<DataDrivenScreenClosedReason>(
    'string',
    (s, v) => t.string.write(s, v),
    (s) => {
        const value = t.string.read(s);
        if (!isCloseReason(value)) {
            throw new ProtocolWireErrors.UnknownScreenCloseReason({ value });
        }
        return value;
    }
);

/** The fields of a `ServerboundDataDrivenScreenClosedPacket`, in wire order. */
export const serverboundDataDrivenScreenClosedPacket = definePacket('ServerboundDataDrivenScreenClosedPacket', {
    /** `FormId`: the screen that closed, as `ClientboundDataDrivenUIShowScreenPacket` assigned it. */
    formId: t.lu32,
    /** `CloseReason`: why the screen went away. */
    closeReason
});

/** The payload of a `ServerboundDataDrivenScreenClosedPacket`. */
export type ServerboundDataDrivenScreenClosedPayload = PayloadOf<typeof serverboundDataDrivenScreenClosedPacket>;
