import CommandParameter from '../network/type/CommandParameter';
import Player from '../player/Player';
import CommandData from '../network/type/CommandData';

interface CommandProps {
    id: string;
    description?: string;
    aliases?: Array<string>;
    flags?: number;
    permission?: string;
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>;
}

export default class Command {
    id: string = '';
    description?: string = '';
    aliases?: Array<string> = [];
    flags?: number = 0;
    permission?: string = '';
    parameters?:
        | Array<Set<CommandParameter>>
        | Set<CommandParameter> = new Set();

    constructor({
        id = '',
        description = '',
        flags = 0,
        permission = '',
        aliases = [],
        parameters
    }: CommandProps) {
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
