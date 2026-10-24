import type ImmutableStringReader from '../ImmutableStringReader';
import LiteralMessage from '../LiteralMessage';
import type Message from '../Message';
import type BuiltInExceptionProvider from './BuiltInExceptionProvider';
import type CommandExceptionType from './CommandExceptionType';

// CommandSyntaxException, the two exception-type classes and BuiltInExceptions
// live in one module on purpose. Split across files they form an import cycle
// (CommandSyntaxException -> BuiltInExceptions -> SimpleCommandExceptionType ->
// CommandSyntaxException) that ahead-of-time compilation refuses (scriptc
// SC1016) and that bundlers only tolerate with lazy-initialization tricks.
// The old module paths re-export from here, so existing imports keep working.

export class SimpleCommandExceptionType implements CommandExceptionType {
    private message: Message;

    public constructor(message: Message) {
        this.message = message;
    }

    public create(): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message);
    }

    public createWithContext(reader: ImmutableStringReader): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message, reader.getString(), reader.getCursor());
    }

    public toString(): string {
        return this.message.getString();
    }
}

export class DynamicCommandExceptionType implements CommandExceptionType {
    private fn: (...args: any[]) => Message;

    public constructor(fn: (...args: any[]) => Message) {
        this.fn = fn;
    }

    /**
     * Calls the message factory with the arguments spelled out: the built-in factories take
     * at most two, and positional calls lower where spread arguments do not.
     */
    private message(args: any[]): Message {
        return this.fn(args[0], args[1], args[2]);
    }

    public create(...args: any[]): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message(args));
    }

    public createWithContext(reader: ImmutableStringReader, ...args: any[]): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message(args), reader.getString(), reader.getCursor());
    }
}

export class BuiltInExceptions implements BuiltInExceptionProvider {
    private static FLOAT_TOO_SMALL = new DynamicCommandExceptionType(
        (found, min) => new LiteralMessage('Float must not be less than ' + min + ', found ' + found)
    );

    private static FLOAT_TOO_BIG = new DynamicCommandExceptionType(
        (found, max) => new LiteralMessage('Float must not be more than ' + max + ', found ' + found)
    );

    private static INTEGER_TOO_SMALL = new DynamicCommandExceptionType(
        (found, min) => new LiteralMessage('Integer must not be less than ' + min + ', found ' + found)
    );

    private static INTEGER_TOO_BIG = new DynamicCommandExceptionType(
        (found, max) => new LiteralMessage('Integer must not be more than ' + max + ', found ' + found)
    );

    private static LITERAL_INCORRECT = new DynamicCommandExceptionType(
        (expected) => new LiteralMessage('Expected literal ' + expected)
    );

    private static READER_EXPECTED_START_OF_QUOTE = new SimpleCommandExceptionType(
        new LiteralMessage('Expected quote to start a string')
    );

    private static READER_EXPECTED_END_OF_QUOTE = new SimpleCommandExceptionType(
        new LiteralMessage('Unclosed quoted string')
    );

    private static READER_INVALID_ESCAPE = new DynamicCommandExceptionType(
        (character) => new LiteralMessage("Invalid escape sequence '" + character + "' in quoted string")
    );

    private static READER_INVALID_BOOL = new DynamicCommandExceptionType(
        (value) => new LiteralMessage("Invalid bool, expected true or false but found '" + value + "'")
    );

    private static READER_INVALID_INT = new DynamicCommandExceptionType(
        (value) => new LiteralMessage("Invalid integer '" + value + "'")
    );

    private static READER_EXPECTED_INT = new SimpleCommandExceptionType(new LiteralMessage('Expected integer'));

    private static READER_INVALID_FLOAT = new DynamicCommandExceptionType(
        (value) => new LiteralMessage("Invalid float '" + value + "'")
    );

    private static READER_EXPECTED_FLOAT = new SimpleCommandExceptionType(new LiteralMessage('Expected float'));

    private static READER_EXPECTED_BOOL = new SimpleCommandExceptionType(new LiteralMessage('Expected bool'));

    private static READER_EXPECTED_SYMBOL = new DynamicCommandExceptionType(
        (symbol) => new LiteralMessage("Expected '" + symbol + "'")
    );

    private static DISPATCHER_UNKNOWN_COMMAND = new SimpleCommandExceptionType(new LiteralMessage('Unknown command'));

    private static DISPATCHER_UNKNOWN_ARGUMENT = new SimpleCommandExceptionType(
        new LiteralMessage('Incorrect argument for command')
    );

    private static DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR = new SimpleCommandExceptionType(
        new LiteralMessage('Expected whitespace to end one argument, but found trailing data')
    );

    private static DISPATCHER_PARSE_EXCEPTION = new DynamicCommandExceptionType(
        (message) => new LiteralMessage('Could not parse command: ' + message)
    );

    public floatTooLow(): DynamicCommandExceptionType {
        return BuiltInExceptions.FLOAT_TOO_SMALL;
    }

    public floatTooHigh(): DynamicCommandExceptionType {
        return BuiltInExceptions.FLOAT_TOO_BIG;
    }

    public integerTooLow(): DynamicCommandExceptionType {
        return BuiltInExceptions.INTEGER_TOO_SMALL;
    }

    public integerTooHigh(): DynamicCommandExceptionType {
        return BuiltInExceptions.INTEGER_TOO_BIG;
    }

    public literalIncorrect(): DynamicCommandExceptionType {
        return BuiltInExceptions.LITERAL_INCORRECT;
    }

    public readerExpectedStartOfQuote(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_START_OF_QUOTE;
    }

    public readerExpectedEndOfQuote(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_END_OF_QUOTE;
    }

    public readerInvalidEscape(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_ESCAPE;
    }

    public readerInvalidBool(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_BOOL;
    }

    public readerInvalidInt(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_INT;
    }

    public readerExpectedInt(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_INT;
    }

    public readerInvalidFloat(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_FLOAT;
    }

    public readerExpectedFloat(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_FLOAT;
    }

    public readerExpectedBool(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_BOOL;
    }

    public readerExpectedSymbol(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_SYMBOL;
    }

    public dispatcherUnknownCommand(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_UNKNOWN_COMMAND;
    }

    public dispatcherUnknownArgument(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_UNKNOWN_ARGUMENT;
    }

    public dispatcherExpectedArgumentSeparator(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR;
    }

    public dispatcherParseException(): DynamicCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_PARSE_EXCEPTION;
    }
}

export default class CommandSyntaxException extends Error {
    public static CONTEXT_AMOUNT = 10;
    public static BUILT_IN_EXCEPTIONS: BuiltInExceptionProvider = new BuiltInExceptions();

    private type: CommandExceptionType;
    private __message: Message;
    private input: string | null;
    private cursor: number;

    public constructor(type: CommandExceptionType, message: Message, input: string | null = null, cursor = -1) {
        super(message.getString());
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
