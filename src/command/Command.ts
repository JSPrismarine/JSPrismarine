import CommandArgumentMap from "./argument/ArgumentMap";
import Argument from "./argument/Argument";
import CommandExecuter from "./CommandExecuter";
import type { CommandDispatcher } from '@jsprismarine/brigadier';
import type Player from '../player/Player';

type Promiseable<T> = Promise<T> | T;

interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
    overflow?: number;
}

export default abstract class Command {
    public id: string;
    public description: string;
    public permission?: string[] | string;
    public aliases?: string[];
    public arguments: CommandArgumentMap;
    public api: "master" | "rfc" = "master";

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
    public dispatch(executer: CommandExecuter, args: any[], stringArgs?: string[]): Promiseable<boolean | void> {};

    /**
     * @deprecated Use new api: `dispatcher` and Command Class instead.
     * @see https://github.com/JSPrismarine/JSPrismarine/pull/351
     */
    public async register(dispatcher: CommandDispatcher<any>): Promise<void> {};

    /**
     * @deprecated Use new api: `dispatcher` and Command Class instead.
     * @see https://github.com/JSPrismarine/JSPrismarine/pull/351
     */
    public async execute(sender: Player, args: any[]): Promise<any> {}

    public fallback(executer: CommandExecuter, args: any[], error: Error, stringArgs?: string[]): Promiseable<void> {
        executer.getServer().getLogger().silly(`§cError[${error.name}] in when executing command "${this.constructor.name}":\n${error.stack || "- No stack"}\n\n${error.message}`);
    };
}
