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

    private _getPlayerManager() {
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
    public getPlayerManager = () => this.withAnnotate().deprecated(new Date('2020-10-19'), this._getPlayerManager);

    private getServer() {
        return this.server;
    }
    private withAnnotate() {
        return this.annotate;
    }
};
