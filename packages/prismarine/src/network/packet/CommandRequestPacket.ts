import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import CommandOriginData from '../type/CommandOriginData';
import CommandOriginType from '../type/CommandOriginType';
import DataPacket from './DataPacket';

/**
 * A slash command a client typed.
 *
 * Wire order at protocol 2193: `Command` as a string with its leading slash, `Origin` as a
 * {@link CommandOriginData}, `IsInternal` as a boolean, then `Version` as a string. `Version`
 * refers to the `CurrentCmdVersion` enum, which the schema gives no `Enum-as-Value` option,
 * so the member name travels rather than its number.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-request-packet/
 */
export default class CommandRequestPacket extends DataPacket {
    public static NetID = Identifiers.CommandRequestPacket;

    /** `Command`: what was typed, with its leading slash still on. */
    public commandName = '';

    /** `Origin`: who or what ran it. A client's own commands carry the `Player` origin. */
    public commandOriginData = new CommandOriginData(CommandOriginType.Player, new UUID(), '', 0n);

    /** `IsInternal`: whether the client raised it itself rather than the player typing it. */
    public internal = false;

    /** `Version`: a `CurrentCmdVersion` member name. */
    public version = '';

    /** Reads `Command`, `Origin`, `IsInternal` and `Version`. */
    public decodePayload(): void {
        this.commandName = NetworkUtil.readString(this);
        this.commandOriginData = CommandOriginData.networkDeserialize(this);
        this.internal = this.readBoolean();
        this.version = NetworkUtil.readString(this);
    }

    /** Writes `Command`, `Origin`, `IsInternal` and `Version`. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.commandName);
        this.commandOriginData.networkSerialize(this);
        this.writeBoolean(this.internal);
        NetworkUtil.writeString(this, this.version);
    }
}
