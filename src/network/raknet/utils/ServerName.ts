import type Prismarine from '../../../Prismarine';
import Identifiers from '../../Identifiers';

export default class ServerName {
    private server: Prismarine;
    private motd: string;
    private name = 'JSRakNet';
    private protocol = Identifiers.Protocol;
    private version = Identifiers.MinecraftVersion;
    private players = {
        online: 0,
        max: 20
    };
    private gamemode: string;
    private serverId = 0;

    constructor(server: Prismarine) {
        this.server = server;
        this.motd = server.getConfig().getMotd();
        this.gamemode = server.getConfig().getGamemode();
        this.players.max = server.getConfig().getMaxPlayers();
    }

    public getMotd() {
        return this.motd;
    }

    public setMotd(motd: string) {
        this.motd = motd;
    }

    public getName() {
        return this.name;
    }

    public setName(name: string) {
        this.name = name;
    }

    public getProtocol() {
        return this.protocol;
    }

    public setProtocol(protocol: number) {
        this.protocol = protocol;
    }

    public getVersion() {
        return this.version;
    }

    public setVersion(version: string) {
        this.version = version;
    }

    public getOnlinePlayerCount() {
        return this.players.online;
    }

    public setOnlinePlayerCount(count: number) {
        this.players.online = count;
    }

    public getMaxPlayerCount() {
        return this.players.max;
    }

    public setMaxPlayerCount(count: number) {
        this.players.max = count;
    }

    public getGamemode() {
        return this.gamemode;
    }

    public setGamemode(gamemode: string) {
        this.gamemode = gamemode;
    }

    public getServerId() {
        return this.serverId;
    }

    public setServerId(id: number) {
        this.serverId = id;
    }

    public toString() {
        return (
            [
                'MCPE',
                this.motd,
                this.protocol,
                this.version,
                this.players.online,
                this.players.max,
                this.serverId,
                this.name,
                this.gamemode
            ].join(';') + ';'
        );
    }
}
