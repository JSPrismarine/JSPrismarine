import { layoutAt, textPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

import type TextPacketType from '../type/TextPacketType';

/**
 * Chat, system messages, popups and translations (docs id 9).
 *
 * Protocol 2193 layout, after the header: "Localize?" boolean (`needsTranslation`), then the
 * "Body" oneOf as a one-byte variant index followed by the one-byte "Message Type" (`type`)
 * and the variant's fields. MessageOnly (0) carries "Message"; AuthorAndMessage (1) carries
 * "Player Name" (`sourceName`) then "Message"; MessageAndParams (2) carries "Message" then a
 * "Parameter List" of varuint count and strings. Then "Sender's XUID", "Platform Id", and
 * "Filtered Message" as an optional: a presence boolean, then the string only when present.
 * The variant index and the "Message Type" are both on the wire: the docs draw each variant's
 * members from zero (translate as 0 inside MessageAndParams), but the byte carries the global
 * `TextPacketType` number (translate as 2), which is what gophertunnel's `text.go` writes after its
 * category byte and what a 1.26 client reads. Older protocols wrote the type first, no
 * variant index, and the filtered string unconditionally.
 */
export default class TextPacket extends DataPacket {
    /** "Message Type": a global `TextPacketType` value, not an index within the body variant. */
    public type!: TextPacketType;
    /** "Localize?": whether the client should run the message through its translations. */
    public needsTranslation!: boolean;
    /** "Player Name": only written for Chat, Whisper and Announcement. */
    public sourceName!: string;

    /** "Message": the text, or a translation key for the MessageAndParams types. */
    public message!: string;
    /** "Parameter List": only written for Translation, Popup and JukeboxPopup. */
    public parameters: string[] = [];
    /** "Sender's XUID". */
    public xuid!: string;
    /** "Platform Id". */
    public platformChatId!: string;
    /** "Filtered Message". An empty string is sent as absent and read back from absent. */
    public filtered!: string;

    public decodePayload(): void {
        const read = layoutAt(textPacket, this.codecProtocol).decode(this);
        this.needsTranslation = read.needsTranslation;
        this.type = read.body.type;
        this.sourceName = read.body.sourceName;
        this.message = read.body.message;
        this.parameters = read.body.parameters;
        this.xuid = read.xuid;
        this.platformChatId = read.platformChatId;
        this.filtered = read.filtered ?? '';
    }

    public encodePayload(): void {
        // Which of the text fields travel is the message type's business, and the layout's
        // body handles it; an empty filtered message is the absent optional.
        layoutAt(textPacket, this.codecProtocol).encode(this, {
            needsTranslation: this.needsTranslation,
            body: {
                type: this.type,
                sourceName: this.sourceName ?? '',
                message: this.message,
                parameters: this.parameters
            },
            xuid: this.xuid,
            platformChatId: this.platformChatId,
            filtered: this.filtered ? this.filtered : null
        });
    }
}
