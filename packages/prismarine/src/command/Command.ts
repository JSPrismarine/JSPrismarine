import type { CommandDispatcher } from '@jsprismarine/brigadier';
import type Player from '../Player';

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export default class Command {
    /**
     * The command's id in a `[namespace]:[id]` format.
     */
    public id: string;

    /**
     * The command's description.
     */
    public description: string;

    /**
     * The command's permission.
     */
    public permission?: string;

    /**
     * The command's aliases.
     */
    public aliases?: string[];

    public constructor({ id = '', description = '', permission = '', aliases = [] }: CommandProps) {
        this.id = id;
        this.description = description;
        this.permission = permission;
        this.aliases = aliases;
    }

    /**
     * Register the command.
     */
    public async register(_dispatcher: CommandDispatcher<any>): Promise<void> {}

    /**
     * Run the command.
     *
     * @deprecated Replaced with "Command.register"
     */
    public async execute(_sender: Player, _args: any[]): Promise<any> {}
}
