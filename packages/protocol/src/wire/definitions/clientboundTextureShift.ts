/**
 * `ClientboundTextureShiftPacket`: updates the client's texture shift system, which step of a
 * texture collection it shows and how far along a shift between two steps it is.
 *
 * Protocol 2193 layout, in wire order: `Action ID` as one {@link TextureShiftAction} byte,
 * `Collection Name`, `From Step` and `To Step` as strings, `All Steps` as a varuint32 count
 * followed by one string per step, `Current Length In Ticks` and `Total Length In Ticks` as
 * varuint64, then `Enabled` as one byte. Strings are a varuint32 byte length followed by
 * UTF-8.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { TextureShiftAction } from '../../packet/ClientboundTextureShiftPacket';
import type { PayloadOf } from '../define';

/** The fields of a `ClientboundTextureShiftPacket`, in wire order. */
export const clientboundTextureShiftPacket = definePacket('ClientboundTextureShiftPacket', {
    /** `Action ID`: the {@link TextureShiftAction} of this update, one byte. */
    action: t.enumOf<TextureShiftAction>(t.uint8),
    /** `Collection Name`: the texture shift collection the update applies to. */
    collectionName: t.string,
    /** `From Step`: the step the shift starts at. */
    fromStep: t.string,
    /** `To Step`: the step the shift ends at. */
    toStep: t.string,
    /** `All Steps`: every step name of the collection, counted by a varuint32. */
    allSteps: t.list(t.string),
    /** `Current Length In Ticks`: how far into the shift the client should be, a varuint64. */
    currentLengthInTicks: t.varuint64,
    /** `Total Length In Ticks`: how long the whole shift takes, a varuint64. */
    totalLengthInTicks: t.varuint64,
    /** `Enabled`: for a `Start` action, whether the shift begins enabled. */
    enabled: t.bool
});

/** The fields of a `ClientboundTextureShiftPacket`, in wire order. */
export type ClientboundTextureShiftPayload = PayloadOf<typeof clientboundTextureShiftPacket>;
