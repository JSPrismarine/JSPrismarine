/**
 * `RequestPermissionsPacket`: An operator asking the server to change another player's permission
 * level.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/request-permissions-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `RequestPermissionsPacket` field list. */
export const requestPermissionsPacket = definePacket('RequestPermissionsPacket', {
    /** Unique id of the player whose level should change. */
    targetPlayerUniqueId: t.li64,
    /** The level requested, see `PlayerPermissionLevel`. */
    playerPermissionLevel: t.varint32,
    /** Per-permission bits that apply when the level is `Custom`. */
    customPermissionFlags: t.lu16
});

/** An operator asking the server to change another player's permission level. */
export type RequestPermissionsPayload = PayloadOf<typeof requestPermissionsPacket>;
