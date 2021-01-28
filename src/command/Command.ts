import Argument from './argument/Argument';
import CommandArgumentMap from './argument/ArgumentMap';
import type { CommandDispatcher } from '@jsprismarine/brigadier';
import CommandExecuter from './CommandExecuter';
import type Player from '../player/Player';

export type Promiseable<T> = Promise<T> | T;

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
    overflow?: number;
}

export default abstract class Command {
    public id: string;
    public label?: string; // If you don't want to use a namespace, use this
    public description: string;
    public permission?: string[] | string;
    public aliases?: string[];
    public arguments: CommandArgumentMap;
    /**
     * This will only be here while supporting api deprecation and will be dropped later.
     * Please do not depend on this for any plugins.
     */
    public api: 'master' | 'rfc' = 'master';

    public constructor({
        id = '',
        description = '',
        permission = '',
        aliases = [],
        overflow = 3
    }: CommandProps) {
        this.id = id;
        this.description = description;
        this.permission = permission;
        this.aliases = aliases;
        this.arguments = new CommandArgumentMap(overflow);
    }

    /**
     * Called on execution. Code that should be ran when a command is called by an executer.
     * @param executer
     * @param args
     * @param stringArgs
     */
    public dispatch(
        executer: CommandExecuter,
        args: any[],
        stringArgs?: string[]
    ): Promiseable<boolean | any> {}

    /**
     * @deprecated Use new api: `dispatcher` and Command Class instead.
     * @see https://github.com/JSPrismarine/JSPrismarine/pull/351
     */
    public async register(dispatcher: CommandDispatcher<any>): Promise<void> {}

    /**
     * @deprecated Use new api: `dispatcher` and Command Class instead.
     * @see https://github.com/JSPrismarine/JSPrismarine/pull/351
     */
    public async execute(sender: Player, args: any[]): Promise<any> {}

    public fallback(
        executer: CommandExecuter,
        args: any[],
        error: Error,
        stringArgs?: string[]
    ): Promiseable<void> {
        executer.sendMessage(`§cAn error when executing command "${this.constructor.name}": ${error.message}`);
        executer
            .getServer()
            .getLogger()
            .silly(
                `§cAn error when executing command "${this.constructor.name}": ${error.message}`
            );
    }
}
