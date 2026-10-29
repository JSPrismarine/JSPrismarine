import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * A command the client issues from a settings screen rather than from the chat bar.
 *
 * Toggling a world setting such as the day and night cycle or the coordinate display builds
 * the matching command line, for example `/gamerule showcoordinates true`, and sends it here.
 * The client asks for the output to be suppressed because its own screen already shows the
 * new value.
 *
 * Bound to the server. Wire order at protocol 2193: Command as a varuint32 length prefixed
 * UTF-8 string, then Suppress Output? as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/settings-command-packet/
 */
export default class SettingsCommandPacket extends DataPacket {
    /** Command: the full command line, leading slash included. */
    public command = '';

    /** Suppress Output?: true when the client wants no chat message back. */
    public suppressOutput = false;

    /** Reads the command line and the suppress flag. */
    public decodePayload(): void {
        this.command = NetworkUtil.readString(this);
        this.suppressOutput = this.readBoolean();
    }

    /** Writes the command line and the suppress flag. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.command);
        this.writeBoolean(this.suppressOutput);
    }
}
