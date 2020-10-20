import Prismarine from "../prismarine";

export default class AnnotatePluginApiFunction {
    private server;
    private name;

    constructor(server: Prismarine, name: string) {
        this.server = server;
        this.name = name;
    }

    public deprecated (date: Date, callback: Function) {
        const removedOn = new Date(date.setDate(date.getDate() + 7));
        this.server.getLogger().warn(`§c[${this.name}] ${callback.name.split('_')[1]} is deprecated and will be removed on §l§e${removedOn.toISOString().split('T')[0]}§r!`);
        return callback;
    }
};
