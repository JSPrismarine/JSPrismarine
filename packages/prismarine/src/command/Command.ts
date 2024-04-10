import { ArgumentCommandNode, type CommandDispatcher } from '@jsprismarine/brigadier';
import type Player from '../Player';

export interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export class Command {
    /**
     * The command's id in a `[namespace]:[id]` format.
     */
    public id: string;

    public get name(): string {
        return this.id.split(':').at(-1)!;
    }

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

    public usage(dispatcher: CommandDispatcher<any>): string {
        // TODO: Improve this, it's not really accurate right now.
        return Array.from(dispatcher.findNode([this.name])?.getChildren() || [])
            .map((child) => {
                if (!(child instanceof ArgumentCommandNode)) return null;
                return child.getUsageText();
            })
            .filter(Boolean)
            .join(' ')
            .trim();
    }
}
