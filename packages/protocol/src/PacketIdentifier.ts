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
    ADD_ACTOR,
    START_GAME = 0x0b,
    MOVE_PLAYER = 0x13,
    TICK_SYNC = 0x17,
    LEVEL_CHUNK = 0x3a,
    REQUEST_CHUNK_RADIUS = 0x45,
    CHUNK_RADIUS_UPDATED,
    NETWORK_CHUNK_PUBLISHER_UPDATE = 0x79,
    LEVEL_EVENT_GENERIC = 0x7c,
    NETWORK_SETTINGS = 0x8f,
    REQUEST_NETWORK_SETTINGS = 0xc1
}
