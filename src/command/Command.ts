import type { CommandDispatcher } from '@jsprismarine/brigadier';
import type Player from '../player/Player';

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export default class Command {
    public id: string;
    public description: string;
    public permission?: string;
    public aliases?: string[];

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

    /**
     * @deprecated Replaced with "Command.register"
     */
    public async execute(sender: Player, args: any[]): Promise<any> {}
}
