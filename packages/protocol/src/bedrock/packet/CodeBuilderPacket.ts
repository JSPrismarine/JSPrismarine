import { codeBuilderPacket } from '../wire/definitions/codeBuilder';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Where the Code Builder websocket server lives, and whether to open the app now.
 *
 * Bound to the client, Education Edition only. The server sends it once while the level data
 * goes out at the start of a game, and again for every Code Builder command.
 *
 * Wire order at protocols 2193 and 2225: URL as a varuint32 length prefixed UTF-8 string, then Should
 * open code builder as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/code-builder-packet/
 */
export default class CodeBuilderPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CodeBuilderPacket';
    }

    /** URL of the Code Builder websocket server. */
    public url = '';

    /** Should open code builder: true to bring the Code Builder app up straight away. */
    public shouldOpenCodeBuilder = false;

    /** Reads the url and the open flag. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(codeBuilderPacket, this.codecProtocol).decode(this));
    }

    /** Writes the url and the open flag. */
    public encodePayload(): void {
        layoutAt(codeBuilderPacket, this.codecProtocol).encode(this, this);
    }
}
