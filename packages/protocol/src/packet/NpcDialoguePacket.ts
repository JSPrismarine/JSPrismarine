import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The `NpcDialogueActionType` enum carried by `NpcDialoguePacket`, numbered as the protocol
 * 2193 docs list them.
 */
export enum NpcDialogueActionType {
    /** Docs: `Open`. Shows the dialogue window. */
    Open = 0,
    /** Docs: `Close`. Dismisses it. */
    Close = 1
}

/** The fields of an `NpcDialoguePacket`, in wire order. */
export interface NpcDialogue {
    /** `Npc Id Raw Id`, the `ActorUniqueID` of the NPC whose dialogue the server fires. */
    npcId: bigint;
    /** `Npc Dialogue Action Type`. */
    actionType: NpcDialogueActionType;
    /** `Dialogue`, the text shown to the player. */
    dialogue: string;
    /** `Scene Name`, the scene the dialogue was pulled from, for the client to reference. */
    sceneName: string;
    /** `Npc Name`, the name shown above the dialogue. */
    npcName: string;
    /**
     * `Action JSON`, the buttons the window offers. The server stays authoritative over which
     * actions a button may run.
     */
    actionJson: string;
}

/**
 * Opens or closes an NPC dialogue window on the client without the player clicking an NPC.
 *
 * Protocol 2193 layout, in wire order: `Npc Id Raw Id` as a little-endian uint64,
 * `Npc Dialogue Action Type` as a ZigZag varint32 holding an {@link NpcDialogueActionType},
 * then `Dialogue`, `Scene Name`, `Npc Name` and `Action JSON` as strings. Strings are a
 * varuint32 byte length followed by UTF-8.
 */
export default class NpcDialoguePacket extends NetworkPacket<NpcDialogue> {
    public get id(): number {
        return PacketIdentifier.NPC_DIALOGUE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: NpcDialogue): void {
        stream.writeUnsignedLongLE(data.npcId);
        stream.writeVarInt(data.actionType);
        stream.writeString(data.dialogue);
        stream.writeString(data.sceneName);
        stream.writeString(data.npcName);
        stream.writeString(data.actionJson);
    }

    protected deserializePayload(stream: NetworkBinaryStream): NpcDialogue {
        return {
            npcId: stream.readUnsignedLongLE(),
            actionType: stream.readVarInt(),
            dialogue: stream.readString(),
            sceneName: stream.readString(),
            npcName: stream.readString(),
            actionJson: stream.readString()
        };
    }
}
