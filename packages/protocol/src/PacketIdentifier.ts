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
    PLAYER_ACTION = 0x24,
    LEVEL_CHUNK = 0x3a,
    REQUEST_CHUNK_RADIUS = 0x45,
    CHUNK_RADIUS_UPDATED,
    SET_LOCAL_PLAYER_AS_INITIALIZED = 0x71,
    NETWORK_CHUNK_PUBLISHER_UPDATE = 0x79,
    LEVEL_EVENT_GENERIC = 0x7c,
    /** Every biome the client can render; a 2193 client cannot finish world generation without it. */
    BIOME_DEFINITION_LIST = 0x7a,
    NETWORK_SETTINGS = 0x8f,
    /** Where the player is and what they pressed, every tick. The only movement packet a client sends now. */
    PLAYER_AUTH_INPUT = 0x90,
    /** The item table. Called `ItemComponent` before 1.21.60, when it carried only components. */
    ITEM_REGISTRY = 0xa2,
    REQUEST_NETWORK_SETTINGS = 0xc1,
    /** The jigsaw structure rules, which a client at 2193 must be sent before `StartGame`. */
    JIGSAW_STRUCTURE_DATA = 0x139
}
