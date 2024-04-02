import type Message from '../Message';
import BuiltInExceptions from './BuiltInExceptions';
import type BuiltInExceptionProvider from './BuiltInExceptionProvider';
import type CommandExceptionType from './CommandExceptionType';

export default class CommandSyntaxException extends Error {
    public static CONTEXT_AMOUNT = 10;
    public static BUILT_IN_EXCEPTIONS: BuiltInExceptionProvider = new BuiltInExceptions();

    private type: CommandExceptionType;
    private __message: Message;
    private input: string | null;
    private cursor: number;

    public constructor(type: CommandExceptionType, message: Message, input: string | null = null, cursor = -1) {
        super(message.getString());
        (Error as any).captureStackTrace?.(this, CommandSyntaxException);
        this.type = type;
        this.__message = message;
        this.input = input;
        this.cursor = cursor;

        this.message = this.getMessage();
    }

    public getMessage(): string {
        let message = this.__message.getString();
        let context = this.getContext();
        if (context != null) {
            message += ' at position ' + this.cursor + ': ' + context;
        }
        return message;
    }

    public getRawMessage(): Message {
        return this.__message;
    }

    public getContext() {
        if (this.input == null || this.cursor < 0) {
            return null;
        }

        let builder = '';
        let cursor = Math.min(this.input.length, this.cursor);
        if (cursor > CommandSyntaxException.CONTEXT_AMOUNT) {
            builder += '...';
        }

        builder += this.input.substring(Math.max(0, cursor - CommandSyntaxException.CONTEXT_AMOUNT), cursor);
        builder += '<--[HERE]';
        return builder;
    }

    public getType(): CommandExceptionType {
        return this.type;
    }

    public getInput() {
        return this.input;
    }

    public getCursor(): number {
        return this.cursor;
    }

    public toString(): string {
        return this.message;
    }
}
