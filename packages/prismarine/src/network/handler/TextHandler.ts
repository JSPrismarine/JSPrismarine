import { Chat } from '../../chat/Chat';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type TextPacket from '../packet/TextPacket';

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
 * The message is relayed with nothing but the sender's name in front of it, so a newline or
 * a lone section sign lets a player draw a second line that looks like somebody else said
 * it. The rest of the C0 controls and the delete character go with them: nothing typed into
 * a chat box produces one.
 */
const isTypeable = (character: string): boolean => {
    const code = character.codePointAt(0) ?? 0;

    return code >= FIRST_PRINTABLE && code !== DELETE && character !== '§';
};

/** Relays what a player typed to the chat manager. */
export default class TextHandler implements PacketHandler<TextPacket> {
    public static NetID = Identifiers.TextPacket;

    /**
     * Sends the message on, once it has been cut to something a chat box could have produced.
     *
     * The length, the formatting codes and the line breaks all come straight off the wire,
     * and none of them is bounded by anything a real client does.
     */
    public async handle(packet: TextPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        const message = [...packet.message.replace(FORMATTING_CODE, '')]
            .filter(isTypeable)
            .join('')
            .trim()
            .slice(0, MAX_MESSAGE_LENGTH);
        if (message.length === 0) return;

        const chat = new Chat({ sender: player, message: `${player.getFormattedUsername()} ${message}` });
        await server.getChatManager().send(chat);
    }
}
