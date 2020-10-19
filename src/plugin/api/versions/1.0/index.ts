import Prismarine from "../../../../prismarine";
import PluginApiVersion from "../../PluginApiVersion";

export const PLUGIN_API_VERSION = '1.0';

export default class PluginApi extends PluginApiVersion {
    server: Prismarine;
    
    constructor(server: Prismarine) {
        super(PLUGIN_API_VERSION);
        this.server = server;
    };
    public async onInit() { }
    public async onExit() { }

    public getLogger() {
        return this.getServer().getLogger();
    }
    public getPlayerManager() {
        return {
            getOnlinePlayers: () => {
                this.getServer().getOnlinePlayers();
            },

            getPlayerByName: (name: string) => {
                this.getServer().getPlayerByName(name);
            },
            getPlayerById: (id: number) => {
                this.getServer().getPlayerById(id);
            },
        };
    }

    private getServer() {
        return this.server;
    }
};
