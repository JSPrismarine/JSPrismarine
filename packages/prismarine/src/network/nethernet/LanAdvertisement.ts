import { getGametypeId } from '@jsprismarine/minecraft';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import type { ServerNameSnapshot } from '@jsprismarine/raknet';

/** The advertisement layout Bedrock Dedicated Server 1.26.51 answers LAN discovery with. */
export const LAN_ADVERTISEMENT_VERSION = 7;

/** The connection type Bedrock Dedicated Server 1.26.51 advertises on the LAN. Its meaning is not documented. */
const LAN_CONNECTION_TYPE = 4;

/**
 * What a server tells a client looking for games on the local network, in the answer to a
 * NetherNet discovery request on UDP 7551. The client lists it among its LAN games.
 */
export interface LanAdvertisement {
    readonly motd: string;
    readonly levelName: string;
    readonly protocol: number;
    /** The game version, such as `1.26.51`. */
    readonly version: string;
    readonly playerCount: number;
    readonly maxPlayers: number;
    /** The `Gametype` id: 0 survival, 1 creative, 2 adventure. */
    readonly gameType: number;
    readonly editorWorld: boolean;
    readonly hardcore: boolean;
    /** Whether a client signed in to Xbox Live may join. */
    readonly acceptsOnlineAuth: boolean;
    /** Whether a client that signs its own login may join, which an online-mode server refuses. */
    readonly acceptsSelfSignedAuth: boolean;
    /** A random token per server start; Bedrock Dedicated Server sends 64 random bits in hex. */
    readonly nonce: string;
    readonly connectionType: number;
}

/**
 * The advertisement for a server, from the status every transport advertises.
 * @param status - The server name's snapshot: MOTD, version and player counts.
 * @param levelName - The level players join.
 * @param onlineMode - Whether the server requires Xbox Live sign-in.
 * @param nonce - This server start's token.
 */
export const lanAdvertisementOf = (
    status: ServerNameSnapshot,
    levelName: string,
    onlineMode: boolean,
    nonce: string
): LanAdvertisement => ({
    motd: status.motd,
    levelName,
    protocol: status.protocol,
    version: status.version,
    playerCount: status.onlinePlayers,
    maxPlayers: status.maxPlayers,
    gameType: getGametypeId(status.gamemode),
    editorWorld: false,
    hardcore: false,
    acceptsOnlineAuth: true,
    acceptsSelfSignedAuth: !onlineMode,
    nonce,
    connectionType: LAN_CONNECTION_TYPE
});

/**
 * Encodes the advertisement in layout {@link LAN_ADVERTISEMENT_VERSION}: a version byte, then
 * varint-prefixed strings, zigzag varints and booleans in a fixed order.
 */
export const encodeLanAdvertisement = (advertisement: LanAdvertisement): Buffer => {
    const stream = new NetworkBinaryStream();
    stream.writeByte(LAN_ADVERTISEMENT_VERSION);
    stream.writeString(advertisement.motd);
    stream.writeVarInt(advertisement.protocol);
    stream.writeString(advertisement.version);
    stream.writeString(advertisement.levelName);
    stream.writeVarInt(advertisement.playerCount);
    stream.writeVarInt(advertisement.maxPlayers);
    stream.writeVarInt(advertisement.gameType);
    stream.writeBoolean(advertisement.editorWorld);
    stream.writeBoolean(advertisement.hardcore);
    stream.writeBoolean(advertisement.acceptsOnlineAuth);
    stream.writeBoolean(advertisement.acceptsSelfSignedAuth);
    stream.writeString(advertisement.nonce);
    stream.writeVarInt(advertisement.connectionType);
    return stream.getBuffer();
};

/**
 * Decodes an advertisement in layout {@link LAN_ADVERTISEMENT_VERSION}.
 * @throws {Error} When the buffer carries another layout version or ends early.
 */
export const decodeLanAdvertisement = (buffer: Buffer): LanAdvertisement => {
    const stream = new NetworkBinaryStream(buffer);
    const version = stream.readByte();
    if (version !== LAN_ADVERTISEMENT_VERSION) {
        throw new Error(`Unsupported LAN advertisement version ${version}`);
    }
    return {
        motd: stream.readString(),
        protocol: stream.readVarInt(),
        version: stream.readString(),
        levelName: stream.readString(),
        playerCount: stream.readVarInt(),
        maxPlayers: stream.readVarInt(),
        gameType: stream.readVarInt(),
        editorWorld: stream.readBoolean(),
        hardcore: stream.readBoolean(),
        acceptsOnlineAuth: stream.readBoolean(),
        acceptsSelfSignedAuth: stream.readBoolean(),
        nonce: stream.readString(),
        connectionType: stream.readVarInt()
    };
};
