/**
 * The docs' `TextPacketType`, the "Message Type" of a `TextPacket`.
 *
 * The docs list the members of each body variant from zero, but the client writes one shared
 * numbering, the same one gophertunnel's `TextPacketType` constants use. Member names are the docs'
 * names in PascalCase.
 */
enum TextPacketType {
    Raw = 0,
    Chat = 1,
    Translate = 2,
    Popup = 3,
    JukeboxPopup = 4,
    Tip = 5,
    SystemMessage = 6,
    Whisper = 7,
    Announcement = 8,
    TextObjectWhisper = 9,
    TextObject = 10,
    TextObjectAnnouncement = 11
}

export default TextPacketType;
