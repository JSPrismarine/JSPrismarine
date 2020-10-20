import Prismarine from "../../../../Prismarine";

/**
 * Provides generic server details such as motd, player-count etc.
 */
export default class Server {
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;

    }

    public getMotd(): string {
        return this.server.getRaknet()?.name.getMotd() || this.server.getConfig().getMotd();
    }

    public getMaxPlayerCount(): number {
        return this.server.getConfig().getMaxPlayers();
    }

    public getOnlinePlayerCount(): number {
        return this.server.getOnlinePlayers().length;
    }
};
