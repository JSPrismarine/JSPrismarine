/**
 * `RemoveVolumeEntityPacket`: Tells the client to drop a volume entity it learned about from an
 * `AddVolumeEntityPacket`.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `RemoveVolumeEntityPacket` field list. */
export const removeVolumeEntityPacket = definePacket('RemoveVolumeEntityPacket', {
    /** `Entity Network Id`, the `Raw Id` an earlier `AddVolumeEntityPacket` gave the volume. */
    entityNetworkId: t.varuint32,
    /** `Dimension Type` the volume is in: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: t.varint32
});

/** Tells the client to drop a volume entity it learned about from an `AddVolumeEntityPacket`. */
export type RemoveVolumeEntityPayload = PayloadOf<typeof removeVolumeEntityPacket>;
