/**
 * `CreatePhotoPacket`: A request to turn a portfolio photo into a photo item in the player's
 * inventory.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CreatePhotoPacket` field list. */
export const createPhotoPacket = definePacket('CreatePhotoPacket', {
    /** `Raw ID`, the unique id of the player whose portfolio holds the photo. */
    rawId: t.lu64,
    /** `Photo Name`, the file name the photo is stored under. */
    photoName: t.string,
    /** `Photo Item Name`, the display name the new photo item gets. */
    photoItemName: t.string
});

/** A request to turn a portfolio photo into a photo item in the player's inventory. */
export type CreatePhotoPayload = PayloadOf<typeof createPhotoPacket>;
