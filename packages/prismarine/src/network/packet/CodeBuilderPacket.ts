import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Where the Code Builder websocket server lives, and whether to open the app now.
 *
 * Bound to the client, Education Edition only. The server sends it once while the level data
 * goes out at the start of a game, and again for every Code Builder command.
 *
 * Wire order at protocol 2193: URL as a varuint32 length prefixed UTF-8 string, then Should
 * open code builder as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/code-builder-packet/
 */
export default class CodeBuilderPacket extends DataPacket {
    /** URL of the Code Builder websocket server. */
    public url = '';

    /** Should open code builder: true to bring the Code Builder app up straight away. */
    public shouldOpenCodeBuilder = false;

    /** Reads the url and the open flag. */
    public decodePayload(): void {
        this.url = NetworkUtil.readString(this);
        this.shouldOpenCodeBuilder = this.readBoolean();
    }

    /** Writes the url and the open flag. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.url);
        this.writeBoolean(this.shouldOpenCodeBuilder);
    }
}
