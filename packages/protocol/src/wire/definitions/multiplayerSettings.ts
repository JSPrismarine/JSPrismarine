/**
 * `MultiplayerSettingsPacket`: A change to the multiplayer settings of an Education Edition
 * session.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/multiplayer-settings-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `MultiplayerSettingsPacket` field list. */
export const multiplayerSettingsPacket = definePacket('MultiplayerSettingsPacket', {
    /** PacketType: the single setting this packet carries. */
    packetType: t.varint32
});

/** A change to the multiplayer settings of an Education Edition session. */
export type MultiplayerSettingsPayload = PayloadOf<typeof multiplayerSettingsPacket>;
