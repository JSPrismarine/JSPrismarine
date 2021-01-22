import Argument from './Argument';
import CommandExecuter from '../CommandExecuter';
import { CommandParameterType } from '../../network/type/CommandParameter';
export default class TextArgument extends Argument<string> {
    public constructor(name: string = 'text', extend?: boolean) {
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
