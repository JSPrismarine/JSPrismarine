import Prismarine from "../prismarine";

export default class AnnotatePluginApiFunction {
    private server;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public deprecated (date: Date, callback: Function) {
        const removedOn = new Date(date.setDate(date.getDate() + 7));
        this.server.getLogger().warn(`§c${callback.name.split('_')[1]} is deprecated and will be removed on §l§e${removedOn.toISOString().split('T')[0]}§r!`);
        return callback;
    }
};
