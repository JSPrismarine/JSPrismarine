import Argument from './Argument';
import CommandExecuter from '../CommandExecuter';
import { CommandParameterType } from '../../network/type/CommandParameter';

export default class StringArgument extends Argument<string> {

    public constructor(name: string = 'string', extend?: boolean) {
        super(name);
        this.extendsTo = extend;
        this.type = CommandParameterType.RawText;
    }

    public parse(
        _executer: CommandExecuter,
        arg: string,
        _currentStack: Argument<unknown>[],
        strArgs: string[]
    ) {
        if (this.extendsTo) {
            return strArgs.slice(0)?.join(' ') || null;
        }
        return arg;
    }
}
