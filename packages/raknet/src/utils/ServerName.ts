/** The protocol version and Minecraft releases a server supports. */
export interface ServerProtocolInfo {
    /** The newest protocol version the server accepts. */
    readonly protocolVersion: number;
    /** Supported Minecraft releases in ascending order; the last is advertised. */
    readonly minecraftVersions: readonly string[];
}

/** The server state a `ServerName` reads when it is created. */
export interface ServerNameSource {
    /** Returns the configuration the advertised MOTD, gamemode, and player cap come from. */
    getConfig(): { getMotd(): string; getGamemode(): string; getMaxPlayers(): number };
}

/** The default Bedrock port, advertised until {@link ServerName.setPort} says otherwise. */
const DEFAULT_PORT = 19_132;

/**
 * The tenth field, which is a flag and not a count.
 *
 * A pong of ten or more fields is dropped by the client unless this one is exactly 1, so it
 * is the price of advertising the ports at all.
 * @see https://github.com/Sandertv/gophertunnel/blob/master/minecraft/listener.go (updatePongData)
 */
const NINTH_FIELD_FLAG = 1;

export class ServerName {
    private readonly server: ServerNameSource;
    private motd: string;
    private name = 'JSRakNet';
    private protocol: number;
    private version: string;
    private maxPlayers: number;
    private onlinePlayers: number = 0;
    private gamemode: string;
    private serverId = 0n;
    private port = DEFAULT_PORT;
    private cachedPongName: string | null = null;

    /**
     * Create a new server name for a RakNet server.
     * @param server - The server instance.
     * @param protocol - The newest protocol and supported Minecraft releases to advertise.
     */
    public constructor(server: ServerNameSource, protocol: ServerProtocolInfo) {
        this.server = server;
        this.motd = server.getConfig().getMotd();
        this.gamemode = server.getConfig().getGamemode();
        this.maxPlayers = server.getConfig().getMaxPlayers();
        this.protocol = protocol.protocolVersion;
        // The newest supported version, which is what a Bedrock Dedicated Server of that
        // version advertises. Advertising the oldest told a current client it had found an
        // older server.
        const newestVersion = protocol.minecraftVersions.at(-1);
        if (newestVersion === undefined) throw new Error('A server name requires a supported Minecraft version!');
        this.version = newestVersion;
    }

    /**
     * Get the message of the day.
     * @returns {string} the message of the day.
     */
    public getMotd(): string {
        return this.motd;
    }
    /**
     * Set the message of the day.
     * @param {string} motd - The message of the day.
     */
    public setMotd(motd: string): void {
        this.motd = motd;
        this.invalidatePongName();
    }

    /**
     * Get the server name.
     * @returns {string} The server name.
     */
    public getName(): string {
        return this.name;
    }
    /**
     * Set the server name.
     * @param {string} name - The server name.
     */
    public setName(name: string): void {
        this.name = name;
        this.invalidatePongName();
    }

    /**
     * Get the protocol version.
     * @returns {number} The protocol version.
     */
    public getProtocol(): number {
        return this.protocol;
    }
    /**
     * Set the protocol version.
     * @param {number} protocol - The protocol version.
     */
    public setProtocol(protocol: number): void {
        this.protocol = protocol;
        this.invalidatePongName();
    }

    /**
     * Get the version of the server.
     * @returns {string} The version of the server.
     */
    public getVersion(): string {
        return this.version;
    }
    /**
     * Set the version of the server.
     * @param {string} version - The version of the server.
     */
    public setVersion(version: string): void {
        this.version = version;
        this.invalidatePongName();
    }

    /**
     * Get the amount of online players.
     * @returns {number} The amount of online players.
     */
    public getOnlinePlayerCount(): number {
        return this.onlinePlayers;
    }
    /**
     * Set the amount of online players.
     * @param {number} count - The amount of online players.
     */
    public setOnlinePlayerCount(count: number): void {
        this.onlinePlayers = count;
        this.invalidatePongName();
    }

    /**
     * Get the maximum amount of players.
     * @returns {number} The maximum amount of players.
     */
    public getMaxPlayerCount(): number {
        return this.maxPlayers;
    }
    /**
     * Set the maximum amount of players.
     * @param {number} count - The maximum amount of players.
     * @returns {void}
     */
    public setMaxPlayerCount(count: number): void {
        this.maxPlayers = count;
        this.invalidatePongName();
    }

    public getGamemode(): string {
        return this.gamemode;
    }
    public setGamemode(gamemode: string): void {
        this.gamemode = gamemode;
        this.invalidatePongName();
    }

    public getServerId(): bigint {
        return this.serverId;
    }
    public setServerId(id: bigint): void {
        this.serverId = id;
        this.invalidatePongName();
    }

    /**
     * Get the port advertised in the MOTD.
     * @returns {number} The port.
     */
    public getPort(): number {
        return this.port;
    }
    /**
     * Set the port advertised in the MOTD. {@link ServerSocket.start} sets it from the socket
     * once it has bound, so a server asked to bind port 0 still advertises the port it got.
     * @param {number} port - The port the server is listening on.
     */
    public setPort(port: number): void {
        this.port = port;
        this.invalidatePongName();
    }

    /**
     * The MOTD line an `UnconnectedPong` carries, in the order a Bedrock Dedicated Server
     * broadcasts it.
     *
     * Semicolon separated and terminated, and positional throughout: the client reads the
     * ports to connect to a server it found on the local network, so a line that stops at the
     * gamemode shows up in the list and cannot be joined from it. The tenth field is a flag
     * rather than a count, and a line this long is dropped unless it is exactly 1.
     * @see https://github.com/Sandertv/gophertunnel/blob/master/minecraft/listener.go (updatePongData)
     * @returns {string} The MOTD line.
     */
    public toString(): string {
        if (this.cachedPongName === null) {
            this.cachedPongName =
                [
                    'MCPE',
                    this.getMotd() || 'Example motd',
                    this.getProtocol(),
                    this.getVersion(),
                    this.getOnlinePlayerCount(),
                    this.getMaxPlayerCount(),
                    this.getServerId(),
                    this.getName(),
                    this.getGamemode(),
                    NINTH_FIELD_FLAG,
                    this.getPort(),
                    this.getPort(),
                    0,
                    0
                ].join(';') + ';';
        }
        return this.cachedPongName;
    }

    private invalidatePongName(): void {
        this.cachedPongName = null;
    }
}
