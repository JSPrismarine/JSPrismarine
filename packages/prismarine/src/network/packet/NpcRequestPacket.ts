import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
 * Wire order at protocol 2193: `NPC Runtime ID` as a varuint64, `Request Type` as a byte,
 * `Actions` as a string, `Action Index` as a byte, then `Scene Name` as a string.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/npc-request-packet/
 */
export default class NpcRequestPacket extends DataPacket {
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
        this.npcRuntimeId = this.readUnsignedVarLong();
        this.requestType = this.readByte();
        this.actions = NetworkUtil.readString(this);
        this.actionIndex = this.readByte();
        this.sceneName = NetworkUtil.readString(this);
    }

    /** Writes the NPC, the request type, and the action and scene it names. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.npcRuntimeId);
        this.writeByte(this.requestType);
        NetworkUtil.writeString(this, this.actions);
        this.writeByte(this.actionIndex);
        NetworkUtil.writeString(this, this.sceneName);
    }
}
