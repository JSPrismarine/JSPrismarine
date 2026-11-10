/**
 * `NpcDialoguePacket`: Opens or closes an NPC dialogue window on the client without the player
 * clicking an NPC.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `NpcDialoguePacket` field list. */
export const npcDialoguePacket = definePacket('NpcDialoguePacket', {
    /** `Npc Id Raw Id`, the `ActorUniqueID` of the NPC whose dialogue the server fires. */
    npcId: t.lu64,
    /** `Npc Dialogue Action Type`. */
    actionType: t.varint32,
    /** `Dialogue`, the text shown to the player. */
    dialogue: t.string,
    /** `Scene Name`, the scene the dialogue was pulled from, for the client to reference. */
    sceneName: t.string,
    /** `Npc Name`, the name shown above the dialogue. */
    npcName: t.string,
    /**
     * `Action JSON`, the buttons the window offers. The server stays authoritative over which
     * actions a button may run.
     */
    actionJson: t.string
});

/** Opens or closes an NPC dialogue window on the client without the player clicking an NPC. */
export type NpcDialoguePayload = PayloadOf<typeof npcDialoguePacket>;
