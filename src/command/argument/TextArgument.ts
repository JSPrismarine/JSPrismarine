import { CommandParameterType } from '../../network/type/CommandParameter';
import CommandExecuter from '../CommandExecuter';
import Argument from './Argument';

export default class TextArgument extends Argument<string> {
    // whether or not the argument extends into the next one.
    public constructor(name: string = 'text', extend: boolean = false) {
        super(name);
        this.extendsTo = extend;
        this.type = CommandParameterType.Value;
    }
    public parse(
        executer: CommandExecuter,
        arg: string,
        currentStack: Argument<unknown>[],
        strArgs: string[]
    ) {
        if (this.extendsTo) {
            // consumes all other arguments!
            return strArgs.slice(0)?.join(' ') || null;
        }
        return arg; // this is a hack.
    }
}
