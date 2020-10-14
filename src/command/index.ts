import CommandParameter from "../network/type/CommandParameter";
import Player from "../player";
const CommandData = require('../network/type/command-data');

interface CommandProps {
    namespace: string,
    name: string,
    description?: string,
    aliases?: Array<string>,
    flags?: number,
    permission?: number,
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>
};

export default class Command extends CommandData {
    namespace: string;
    name: string;
    description?: string;
    aliases?: Array<string>;
    flags?: number;
    permission?: number;
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>;

    constructor({ namespace = '', name = '', description = '', flags = 0, permission = 0, aliases = [], parameters }: CommandProps) {
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
    public execute(sender: Player, args: Array<string> = []): void { }
}
