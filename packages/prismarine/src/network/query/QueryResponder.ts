import { createHmac, randomBytes } from 'node:crypto';

/** The two bytes every query request starts with. */
const QUERY_MAGIC = 0xfe_fd;
/** A request asking for a challenge token. */
const TYPE_HANDSHAKE = 0x09;
/** A request asking for the server's status, carrying the challenge token. */
const TYPE_STAT = 0x00;
/** The client masks its session id with this, and the server echoes it masked. */
const SESSION_ID_MASK = 0x0f_0f_0f_0f;
/** Magic, type and session id: what every request carries before its payload. */
const HEADER_BYTES = 7;
/** A basic stat request's payload is the token; a full stat request pads it with four bytes. */
const FULL_STAT_PADDING_BYTES = 4;

/** What a full stat reply opens its key-value section with. Clients skip it unread. */
const FULL_STAT_KV_PADDING = Buffer.from('splitnum\0\x80\0', 'latin1');
/** What separates a full stat reply's key-value section from its player list. */
const FULL_STAT_PLAYER_PADDING = Buffer.from('\x01player_\0\0', 'latin1');

/** The server's status as a query reply reports it, read once per stat request. */
export interface QueryStatus {
    /** The message of the day, the reply's `hostname`. */
    readonly motd: string;
    /** The game version the server speaks. */
    readonly version: string;
    /** The server software and its version, reported as `server_engine` and `plugins`. */
    readonly software: string;
    /** The world players join, reported as `map`. */
    readonly map: string;
    readonly onlinePlayers: number;
    readonly maxPlayers: number;
    /** The port clients join on. */
    readonly hostPort: number;
    /** The address the server is bound to. */
    readonly hostIp: string;
    /** The names of the players online. */
    readonly players: readonly string[];
}

/**
 * Answers the GameSpy4 query protocol that Minecraft server lists and status tools speak:
 * a handshake hands out a challenge token, and a stat request carrying a valid token gets
 * the basic or the full status back.
 *
 * Tokens are an HMAC of the sender's address and port under a secret drawn per responder, so
 * the responder keeps no state per client and a forged source address cannot get a status
 * reply without first receiving the handshake reply. Without the token check, any spoofed
 * stat request would reflect a reply larger than itself at a third party.
 *
 * Pure: it turns a request into a reply and leaves sending to the caller, so the same
 * responder answers on RakNet's socket or on a socket of its own.
 * @see https://wiki.vg/Query
 */
export class QueryResponder {
    /**
     * @param status - Reads the status a stat reply reports.
     * @param secret - The key challenge tokens are derived under; fresh random bytes by default.
     */
    public constructor(
        private readonly status: () => QueryStatus,
        private readonly secret: Buffer = randomBytes(32)
    ) {}

    /**
     * Whether a datagram is a query request at all, by its magic. RakNet's offline traffic
     * never starts with these two bytes, which is what lets query share its socket.
     * @param datagram - A datagram as it arrived.
     * @returns `true` when the datagram starts with the query magic.
     */
    public static isQuery(datagram: Buffer): boolean {
        return datagram.byteLength >= 2 && datagram.readUInt16BE(0) === QUERY_MAGIC;
    }

    /**
     * Builds the reply to one request.
     * @param datagram - The request as it arrived.
     * @param address - The sender's address, which its challenge token is bound to.
     * @param port - The sender's port.
     * @returns The reply, or `undefined` for a malformed request, an unknown type or a stat
     * request without its sender's token, none of which get an answer.
     */
    public respond(datagram: Buffer, address: string, port: number): Buffer | undefined {
        if (datagram.byteLength < HEADER_BYTES || !QueryResponder.isQuery(datagram)) return undefined;
        const type = datagram[2];
        const sessionId = datagram.readInt32BE(3) & SESSION_ID_MASK;
        const payload = datagram.subarray(HEADER_BYTES);
        const token = this.tokenFor(address, port);

        if (type === TYPE_HANDSHAKE) {
            return Buffer.concat([header(TYPE_HANDSHAKE, sessionId), cString(String(token))]);
        }

        if (type !== TYPE_STAT || payload.byteLength < 4 || payload.readInt32BE(0) !== token) return undefined;
        const status = this.status();
        return payload.byteLength >= 4 + FULL_STAT_PADDING_BYTES
            ? fullStat(sessionId, status)
            : basicStat(sessionId, status);
    }

    /** The challenge token a sender must echo, as the signed 32-bit integer it travels as. */
    private tokenFor(address: string, port: number): number {
        return createHmac('sha256', this.secret).update(`${address}:${port}`).digest().readInt32BE(0);
    }
}

/** A reply's type byte and the session id it echoes. */
const header = (type: number, sessionId: number): Buffer => {
    const buffer = Buffer.alloc(5);
    buffer[0] = type;
    buffer.writeInt32BE(sessionId, 1);
    return buffer;
};

/** A null-terminated string. Query strings travel as Latin-1, so other characters become `?`. */
const cString = (value: string): Buffer => {
    const latin1 = Array.from(value, (char) => {
        const code = char.codePointAt(0) ?? 0;
        return code >= 0x01 && code <= 0xff ? char : '?';
    }).join('');
    return Buffer.from(`${latin1}\0`, 'latin1');
};

/** The short status: what a server list shows, with the host port as a little-endian short. */
const basicStat = (sessionId: number, status: QueryStatus): Buffer => {
    const hostPort = Buffer.alloc(2);
    hostPort.writeUInt16LE(status.hostPort);
    return Buffer.concat([
        header(TYPE_STAT, sessionId),
        cString(status.motd),
        cString('SMP'),
        cString(status.map),
        cString(String(status.onlinePlayers)),
        cString(String(status.maxPlayers)),
        hostPort,
        cString(status.hostIp)
    ]);
};

/**
 * The long status: every key a Bedrock server reports, then the player names. The software goes
 * in `server_engine`, as PocketMine-MP reports it, and leads `plugins`, as Spigot and
 * CraftBukkit report it, so tools reading either key name the server.
 */
const fullStat = (sessionId: number, status: QueryStatus): Buffer => {
    const fields: [string, string][] = [
        ['hostname', status.motd],
        ['gametype', 'SMP'],
        ['game_id', 'MINECRAFTPE'],
        ['version', status.version],
        ['server_engine', status.software],
        // TODO: list the loaded plugins after the software, as `software: a; b`, once the
        // plugin API reports them. Until then the software alone is what Spigot sends with none.
        ['plugins', status.software],
        ['map', status.map],
        ['numplayers', String(status.onlinePlayers)],
        ['maxplayers', String(status.maxPlayers)],
        // TODO: report `whitelist` as `on` or `off`, as PocketMine-MP and Bedrock Dedicated
        // Server do, once the server has an allow-list to report.
        ['hostport', String(status.hostPort)],
        ['hostip', status.hostIp]
    ];
    return Buffer.concat([
        header(TYPE_STAT, sessionId),
        FULL_STAT_KV_PADDING,
        ...fields.flatMap(([key, value]) => [cString(key), cString(value)]),
        Buffer.from([0]),
        FULL_STAT_PLAYER_PADDING,
        ...status.players.map(cString),
        Buffer.from([0])
    ]);
};
