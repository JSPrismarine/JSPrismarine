import CommandArgumentMap from "./argument/ArgumentMap";
import Argument from "./argument/Argument";
import CommandExecuter from "./CommandExecuter";

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

    public abstract execute(executer: CommandExecuter, args: Argument[], stringArgs?: string[]): boolean | void;
}
