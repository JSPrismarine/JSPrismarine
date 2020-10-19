import Prismarine from "../../../../prismarine";
import AnnotatePluginApiFunction from "../../../AnnotatePluginApiFunction";
import PluginApiVersion from "../../PluginApiVersion";

export const PLUGIN_API_VERSION = '1.0';

export default class PluginApi extends PluginApiVersion {
    private server: Prismarine;
    private annotate;
    
    constructor(server: Prismarine) {
        super(PLUGIN_API_VERSION);
        this.server = server;
        this.annotate = new AnnotatePluginApiFunction(server);
    };
    public async onInit() { }
    public async onExit() { }

    public getLogger() {
        return this.getServer().getLogger();
    }

    private _getPlayerManager(server: Prismarine) {
        return {
            getOnlinePlayers: () => {
                return server.getOnlinePlayers();
            },

            getPlayerByName: (name: string) => {
                return server.getPlayerByName(name);
            },
            getPlayerById: (id: number) => {
                return server.getPlayerById(id);
            },
        };
    }
    public getPlayerManager () {
        return (this.withAnnotate().deprecated(new Date('2020-10-19'), this._getPlayerManager))(this.server);
    }

    private getServer() {
        return this.server;
    }
    private withAnnotate() {
        return this.annotate;
    }
};
