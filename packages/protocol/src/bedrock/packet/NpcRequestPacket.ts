import { npcRequestPacket } from '../wire/definitions/npcRequest';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/** What the player asked the NPC to do, as the `Request Type` byte numbers it. */
export enum NpcRequestType {
    SetActions = 0,
    ExecuteAction = 1,
    ExecuteClosingCommands = 2,
    SetName = 3,
    SetSkin = 4,
    SetInteractText = 5,
    ExecuteOpeningCommands = 6
}

/**
 * What a player did with an NPC, sent when they interact with one or edit it.
 *
 * The target actor has to carry the NPC component. Education Edition is the only place the
 * component ships, though the dialogue system is exposed to add-ons.
 *
 * Wire order at protocols 2193 and 2225: `NPC Runtime ID` as a varuint64, `Request Type` as a byte,
 * `Actions` as a string, `Action Index` as a byte, then `Scene Name` as a string.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/npc-request-packet/
 */
export default class NpcRequestPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'NpcRequestPacket';
    }

    /** The NPC the player interacted with. */
    public npcRuntimeId = 0n;

    public requestType: NpcRequestType = NpcRequestType.SetActions;

    /** The NPC's buttons and their commands, as a JSON document. May hold several commands. */
    public actions = '';

    /** Which button of `actions` was pressed. */
    public actionIndex = 0;

    /** The dialogue scene to use. Empty means the last scene the player was sent. */
    public sceneName = '';

    /** Reads the NPC, the request type, and the action and scene it names. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(npcRequestPacket, this.codecProtocol).decode(this));
    }

    /** Writes the NPC, the request type, and the action and scene it names. */
    public encodePayload(): void {
        layoutAt(npcRequestPacket, this.codecProtocol).encode(this, this);
    }
}
