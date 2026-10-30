/**
 * `PlayerSkinPacket`: a player changing skin mid-session, described as a declarative field
 * list.
 *
 * Wire order: `UUID` (the player's), `Serialized Skin`, `Localized New Skin Name`,
 * `Localized Old Skin Name`. Protocol 2225 dropped the skin's own `PlayFabID` from
 * `SerializedSkin` ordinal 1; unlike the player list, nothing takes the field's place here -
 * the packet has no entry to move it onto - so a 2225 skin is simply one string shorter. The
 * move is expressed as a gated pair of skin layouts. `playerList.wire.ts` has the schema
 * citations and the failure the 2225 layout avoids.
 *
 * This definition lives beside the class because `Skin` and `UUID` are prismarine-owned; it
 * moves to `@jsprismarine/protocol`'s registry when they do.
 */
import { definePacket, gated, SINCE_2225, t, UNTIL_2225 } from '@jsprismarine/protocol';
import { SKIN_WIRE_2193, SKIN_WIRE_2225 } from '../../utils/skin/Skin';
import { serializedSkin, uuid } from '../wire/fieldTypes';

import type Skin from '../../utils/skin/Skin';
import type { PayloadOf } from '@jsprismarine/protocol';

/** The `PlayerSkinPacket` field list; the module doc carries the wire provenance. */
export const playerSkinPacket = definePacket('PlayerSkinPacket', {
    /** `UUID`: the player whose skin changed. */
    uuid,
    /** The skin in the 2193 `SerializedSkin` layout, PlayFab id inside. */
    skinCarryingPlayFabId: gated<Skin | null>(UNTIL_2225, serializedSkin(SKIN_WIRE_2193), null),
    /** The skin in the 2225 `SerializedSkin` layout, one string shorter. */
    skinWithoutPlayFabId: gated<Skin | null>(SINCE_2225, serializedSkin(SKIN_WIRE_2225), null),
    /** `Localized New Skin Name`. */
    newSkinName: t.string,
    /** `Localized Old Skin Name`. */
    oldSkinName: t.string
});

/** What `PlayerSkinPacket` carries, at every version; derived from the field list. */
export type PlayerSkinPayload = PayloadOf<typeof playerSkinPacket>;
