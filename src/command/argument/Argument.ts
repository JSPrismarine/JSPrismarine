import CommandParameter, { CommandParameterType } from '../../network/type/CommandParameter';
import type CommandExecuter from '../CommandExecuter';

type Promiseable<T> = Promise<T> | T;
export default abstract class Argument {
    /** If no name is provided, the name is auto inferred from the class name. */
    public name: string;
    public optional: boolean;
    public type: CommandParameterType;

    constructor(name?: string, optional: boolean = true, type?: CommandParameterType) {
        this.name = name || this.constructor.name;
        this.optional = optional;
        this.type = type || CommandParameterType.RawText;
    }

    /**
     * Parses an argument. Use "null" if parsing should fail.
     * @param executer
     * @param arg
     * @param currentStack
     */
    public abstract parse<T>(executer: CommandExecuter, arg: string, currentStack: Argument[]): Promiseable<T | null>;

    public get networkData(): CommandParameter {
        return new CommandParameter({
            name: this.name,
            type: this.type,
            optional: this.optional
        });
    }
}
