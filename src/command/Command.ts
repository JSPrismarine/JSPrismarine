import type { CommandDispatcher } from '@jsprismarine/brigadier';

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export default abstract class Command {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];

    constructor({
        id = '',
        description = '',
        permission = '',
        aliases = []
    }: CommandProps) {
        this.id = id;
        this.description = description;
        this.permission = permission;
        this.aliases = aliases;
    }

    /**
     * Called when the command is executed.
     */
    public abstract register(dispatcher: CommandDispatcher<any>): Promise<void>;
}
