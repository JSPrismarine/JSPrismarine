/**
 * `NpcRequestPacket`: What a player did with an NPC, sent when they interact with one or edit it.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/npc-request-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `NpcRequestPacket` field list. */
export const npcRequestPacket = definePacket('NpcRequestPacket', {
    /** The NPC the player interacted with. */
    npcRuntimeId: t.varuint64,
    /** `Request Type`. */
    requestType: t.uint8,
    /** The NPC's buttons and their commands, as a JSON document. May hold several commands. */
    actions: t.string,
    /** Which button of `actions` was pressed. */
    actionIndex: t.uint8,
    /** The dialogue scene to use. Empty means the last scene the player was sent. */
    sceneName: t.string
});

/** What a player did with an NPC, sent when they interact with one or edit it. */
export type NpcRequestPayload = PayloadOf<typeof npcRequestPacket>;
