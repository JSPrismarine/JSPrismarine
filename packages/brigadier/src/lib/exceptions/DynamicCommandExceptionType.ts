import type Message from '../Message';
import type CommandExceptionType from './CommandExceptionType';
import CommandSyntaxException from './CommandSyntaxException';
import type ImmutableStringReader from '../ImmutableStringReader';

export default class DynamicCommandExceptionType implements CommandExceptionType {
    private fn: Function;

    public constructor(fn: (...args: any[]) => Message) {
        this.fn = fn;
        (Error as any).captureStackTrace?.(this, DynamicCommandExceptionType);
    }

    public create(...args: any[]): CommandSyntaxException {
        return new CommandSyntaxException(this, this.fn(...args));
    }

    public createWithContext(reader: ImmutableStringReader, ...args: any[]): CommandSyntaxException {
        return new CommandSyntaxException(this, this.fn(...args), reader.getString(), reader.getCursor());
    }
}
