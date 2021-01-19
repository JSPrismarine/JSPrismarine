import type { CommandDispatcher } from '@jsprismarine/brigadier';

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export default class Command {
    id: string;
    description: string;
    permission?: string;
    aliases?: string[];

    public constructor({
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

    public async register(dispatcher: CommandDispatcher<any>): Promise<void> {}
}
