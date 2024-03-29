/**
 * Enum representing packet identifiers.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/packets.html}
 */
export enum PacketIdentifier {
    LOGIN = 1,
    PLAY_STATUS,
    SERVER_TO_CLIENT_HANDSHAKE,
    CLIENT_TO_SERVER_HANDSHAKE,
    DISCONNECT,
    RESOURCE_PACKS_INFO,
    RESOURCE_PACK_STACK,
    RESOURCE_PACK_CLIENT_RESPONSE,
    TEXT,
    SET_TIME,
    ADD_PLAYER,
    MOVE_PLAYER = 0x13,
    START_GAME = 0x0b,
    REQUEST_NETWORK_SETTINGS = 0xc1
}
