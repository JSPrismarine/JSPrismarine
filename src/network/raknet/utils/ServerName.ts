import type Prismarine from '../../../Prismarine';
import Identifiers from '../../Identifiers';

export default class ServerName {
    private server: Prismarine;
    private motd: string;
    private name = 'JSRakNet';
    private protocol = Identifiers.Protocol;
    private version = Identifiers.MinecraftVersion;
    private maxPlayers: number;
    private gamemode: string;
    private serverId = 0n;

    public constructor(server: Prismarine) {
        this.server = server;
        this.motd = server.getConfig().getMotd();
        this.gamemode = server.getConfig().getGamemode();
        this.maxPlayers = server.getConfig().getMaxPlayers();
    }

    public getMotd(): string {
        return this.motd;
    }

    public setMotd(motd: string): void {
        this.motd = motd;
    }

    public getName(): string {
        return this.name;
    }

    public setName(name: string): void {
        this.name = name;
    }

    public getProtocol(): number {
        return this.protocol;
    }

    public setProtocol(protocol: number): void {
        this.protocol = protocol;
    }

    public getVersion(): string {
        return this.version;
    }

    public setVersion(version: string): void {
        this.version = version;
    }

    public getOnlinePlayerCount(): number {
        return this.server.getOnlinePlayers().length;
    }

    public getMaxPlayerCount(): number {
        return this.maxPlayers;
    }

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
                this.getMotd() ?? 'Example motd',
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
