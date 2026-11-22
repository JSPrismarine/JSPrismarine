import { chatPacket } from '../wire/definitions/added2259';
import type { ChatPayload } from '../wire/definitions/added2259';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * A chat message signed by Mojang's chat service, with the room it belongs to and how to format it.
 *
 * Added at protocol 2259 (Minecraft Preview 1.26.70.24); the layout is read off Mojang's
 * v1.26.70-preview.24 schemas. A codec older than 2259 has no id for it.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
export default class ChatPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ChatPacket';
    }

    /** `Signed Chat`. */
    public signedChat: ChatPayload['signedChat'] = {
        keyId: '',
        senderId: '',
        messageId: '',
        scanText: '',
        redactedText: '',
        authorName: '',
        signature: ''
    };

    /** `Room Id`, absent when the message belongs to no room. */
    public roomId: string | null = null;

    /** `Formatting`, absent when the message is unformatted. */
    public formatting: ChatPayload['formatting'] = null;

    /** Writes the fields in layout order. */
    public encodePayload(): void {
        layoutAt(chatPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(chatPacket, this.codecProtocol).decode(this));
    }
}
