/**
 * The "Message Type" of a `TextPacket`.
 *
 * The docs list the members of each body variant from zero, but the client writes one shared
 * numbering, the same one gophertunnel's `TextType` constants use. `JsonAnnouncement` is the
 * docs' `textObjectAnnouncement`.
 */
enum TextType {
    Raw = 0,
    Chat = 1,
    Translation = 2,
    Popup = 3,
    JukeboxPopup = 4,
    Tip = 5,
    System = 6,
    Whisper = 7,
    Announcement = 8,
    JsonWhisper = 9,
    Json = 10,
    JsonAnnouncement = 11
}

export default TextType;
