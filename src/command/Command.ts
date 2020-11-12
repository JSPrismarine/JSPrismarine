import CommandParameter from '../network/type/CommandParameter';
import Player from '../player/Player';
const CommandData = require('../network/type/command-data');

interface CommandProps {
    id: string;
    description?: string;
    aliases?: Array<string>;
    flags?: number;
    permission?: string;
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>;
}

export default class Command extends CommandData {
    id: string;
    description?: string;
    aliases?: Array<string>;
    flags?: number;
    permission?: string;
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>;

    constructor({
        id = '',
        description = '',
        flags = 0,
        permission = '',
        aliases = [],
        parameters
    }: CommandProps) {
        super();
        this.id = id;
        this.description = description;
        this.flags = flags;
        this.permission = permission;
        this.aliases = aliases;
        this.parameters = parameters;
    }

    /**
     * Called when the command is executed.
     */
    public execute(
        sender: Player,
        args: Array<string> = []
    ): string | void | Promise<string | void> {}
}
