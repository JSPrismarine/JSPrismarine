import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';
import type CommandExecuter from '../CommandExecuter';

type Promiseable<T> = Promise<T> | T;
export default abstract class Argument<T = unknown> {
    /** If no name is provided, the name is auto inferred from the class name. */
    public name: string;
    public optional: boolean;
    public type: CommandParameterType;
    public extendsTo?: number | boolean;

    constructor(name?: string, optional = true, type?: CommandParameterType) {
        this.name = name || this.constructor.name;
        this.optional = optional;
        this.type = type || CommandParameterType.RawText;
    }

    /**
     * Parses an argument. Use "null" if parsing should fail silently, use throw if parsing should stop.
     * @param executer
     * @param arg
     * @param currentStack
     */
    public abstract parse(
        executer: CommandExecuter,
        arg: string,
        currentStack: Argument[],
        strArgs?: string[]
    ): Promiseable<T | null>;

    public failed(
        executer: CommandExecuter,
        arg: string,
        error: Error | string
    ): Promiseable<void> {
        executer.sendMessage('Invalid argument provided for: ' + this.name); // eslint-disable-line
        console.error(error);
    }

    /**
     * This is bound to change, if you override this, you will not be api protected.
     */
    public getNetworkData(): CommandParameter {
        return new CommandParameter({
            name: this.name,
            type: this.type,
            optional: this.optional
        });
    }
}
