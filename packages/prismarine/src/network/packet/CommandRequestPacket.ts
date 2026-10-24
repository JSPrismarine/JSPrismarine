import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import CommandOriginData from '../type/CommandOriginData';
import DataPacket from './DataPacket';

/**
 * A slash command a client typed.
 *
 * Wire order at protocol 2193: `Command` (string, leading slash included), `Origin`
 * (a {@link CommandOriginData}), `IsInternal` (boolean), `Version` (string).
 *
 * **Bound To:** Server
 */
export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    /** `Command`: what was typed, with its leading slash still on. */
    public commandName!: string;

    /** `Origin`: who or what ran it. */
    public commandOriginData!: CommandOriginData | null;

    /** `IsInternal`: whether the client raised it itself rather than the player typing it. */
    public internal!: boolean;

    /** `Version`: a `CurrentCmdVersion` name, a string rather than the number it used to be. */
    public version!: string;

    /** Reads `Command`, `Origin`, `IsInternal` and `Version`. */
    public decodePayload(): void {
        this.commandName = NetworkUtil.readString(this);
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBoolean();
        this.version = NetworkUtil.readString(this);
    }
}
