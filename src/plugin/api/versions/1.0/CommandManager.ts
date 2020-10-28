import type Command from "../../../../command/Command";
import type Prismarine from "../../../../Prismarine";

export default class CommandManager {
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public registerCommand(command: Command) {
        this.server.getCommandManager().registerClassCommand(command, this.server);
    }
};
