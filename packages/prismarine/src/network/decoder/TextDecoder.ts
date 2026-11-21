import { TextPacketType } from '@jsprismarine/protocol';
import type TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** What a Bedrock client's chat box lets a player type, and so the most the server takes. */
const MAX_MESSAGE_LENGTH = 512;

/** A client-side formatting code: the section sign and the character it colors. */
const FORMATTING_CODE = /§./gu;

/** The delete character, which is a control character outside the C0 block. */
const DELETE = 0x7f;

/** The first character a keyboard can produce; everything below it is a C0 control. */
const FIRST_PRINTABLE = 0x20;

/**
 * Whether a character is one a chat box could have produced.
 *
 * The message is relayed under the sender's name, so a newline or a lone section sign lets a
 * player draw a second line that looks like somebody else said it. The rest of the C0
 * controls and the delete character go with them: nothing typed into a chat box produces one.
 */
const isTypeable = (character: string): boolean => {
    const code = character.codePointAt(0) ?? 0;

    return code >= FIRST_PRINTABLE && code !== DELETE && character !== '§';
};

/**
 * What a player typed into chat.
 *
 * A client only ever sends `Chat`; the other eleven types are the server's to send, so a packet
 * carrying one of them is dropped. The author, XUID and platform id the packet names are ignored
 * as well: the relay takes all three from the server's record of the sender. The message is cut
 * to something a chat box could have produced, since the length, the formatting codes and the
 * line breaks all come straight off the wire and none of them is bounded by anything a real
 * client does.
 */
export default class TextDecoder implements PacketDecoder<TextPacket, 'chat'> {
    public static readonly PacketName = 'TextPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['chat'] as const;

    /** Decodes a chat line, or nothing for a message with nothing left once it is cleaned. */
    public decode(packet: TextPacket, view: DecodeView): readonly Intent<'chat'>[] {
        const text = packet.getPacketData();

        if (text === null) {
            view.log.verbose(`Dropped an empty text packet from ${view.name}`);
            return [];
        }

        if (text.type !== TextPacketType.Chat) {
            view.log.verbose(
                `Dropped a text of type ${TextPacketType[text.type] ?? text.type} from ${view.name}: a client only sends Chat`
            );
            return [];
        }

        const message = [...text.message.replace(FORMATTING_CODE, '')]
            .filter(isTypeable)
            .join('')
            .trim()
            .slice(0, MAX_MESSAGE_LENGTH);
        if (message.length === 0) return [];

        return [{ kind: 'chat', message }];
    }
}
