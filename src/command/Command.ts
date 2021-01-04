import CommandExecuter from './CommandExecuter';
import CommandParameter from '../network/type/CommandParameter';

interface CommandProps {
    id: string;
    description?: string;
    aliases?: string[];
    flags?: number;
    permission?: string;
    parameters?: Array<Set<CommandParameter>> | Set<CommandParameter>;
}

export default abstract class Command {
    id: string;
    description?: string;
    aliases?: string[];
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
    public abstract execute(
        sender: CommandExecuter,
        args: Array<string | number>
    ): string | void | Promise<string | void>;

    public abstract handle(): Promise<string>;
}
