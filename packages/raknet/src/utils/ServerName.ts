export class ServerName {
    private readonly server: any;
    private motd: string;
    private name = 'JSRakNet';
    private protocol;
    private version;
    private maxPlayers: number;
    private gamemode: string;
    private serverId = 0n;

    /**
     * Create a new server name for a RakNet server.
     * @constructor
     * @param {any} server - The server instance.
     */
    public constructor(server: any) {
        this.server = server;
        this.motd = server.getConfig().getMotd();
        this.gamemode = server.getConfig().getGamemode();
        this.maxPlayers = server.getConfig().getMaxPlayers();
        this.protocol = (server as any).getIdentifiers().Protocol;
        this.version = (server as any).getIdentifiers().MinecraftVersions.at(0)!;
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
    }

    /**
     * Get the amount of online players.
     * @returns {number} The amount of online players.
     */
    public getOnlinePlayerCount(): number {
        return this.server.getPlayerManager().getOnlinePlayers().length;
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
    }

    public getGamemode(): string {
        return this.gamemode;
    }
    public setGamemode(gamemode: string): void {
        this.gamemode = gamemode;
    }

    public getServerId(): bigint {
        return this.serverId;
    }
    public setServerId(id: bigint): void {
        this.serverId = id;
    }

    public toString(): string {
        return (
            [
                'MCPE',
                this.getMotd() || 'Example motd',
                this.getProtocol(),
                this.getVersion(),
                this.getOnlinePlayerCount(),
                this.getMaxPlayerCount(),
                this.getServerId(),
                this.getName(),
                this.getGamemode()
            ].join(';') + ';'
        );
    }
}
