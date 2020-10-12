import Player from "../player/player";
const CommandData = require('../network/type/command-data');

interface CommandData {
    namespace: string,
    name: string,
    description?: string,
    aliases?: Array<string>,
    flags?: number,
    permission?: number,
    parameters?: any
};

export default class Command extends CommandData {
    constructor({ namespace = '', name = '', description = '', flags = 0, permission = 0, aliases = [], parameters = new Set() }: CommandData) {
        super();
        this.namespace = namespace;
        this.name = name;
        this.description = description;
        this.flags = flags;
        this.permission = permission;
        this.aliases = aliases;
        this.parameters = parameters;
    }

    /**
     * Called when the command is executed.
     */
    execute(sender: Player, args: Array<string> = [], commandName: string) {

    }

}
