import LiteralMessage from '../LiteralMessage';
import type BuiltInExceptionProvider from './BuiltInExceptionProvider';
import { SimpleCommandExceptionType } from './SimpleCommandExceptionType';
import { DynamicCommandExceptionType } from './DynamicCommandExceptionType';

// Lazily instantiate every exception type via a memoized factory. This keeps the
// `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` calls
// out of the BuiltInExceptions class's static-initialization phase, which under Vite 8
// (Rolldown) can fire before the named imports for those classes are fully resolved
// thanks to the
//   BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions
// module load cycle.
const memo = <T>(make: () => T): (() => T) => {
    let value: T | null = null;
    return () => (value ??= make());
};

export default class BuiltInExceptions implements BuiltInExceptionProvider {
    private static FLOAT_TOO_SMALL = memo(
        () =>
            new DynamicCommandExceptionType(
                (found, min) => new LiteralMessage('Float must not be less than ' + min + ', found ' + found)
            )
    );

    private static FLOAT_TOO_BIG = memo(
        () =>
            new DynamicCommandExceptionType(
                (found, max) => new LiteralMessage('Float must not be more than ' + max + ', found ' + found)
            )
    );

    private static INTEGER_TOO_SMALL = memo(
        () =>
            new DynamicCommandExceptionType(
                (found, min) => new LiteralMessage('Integer must not be less than ' + min + ', found ' + found)
            )
    );

    private static INTEGER_TOO_BIG = memo(
        () =>
            new DynamicCommandExceptionType(
                (found, max) => new LiteralMessage('Integer must not be more than ' + max + ', found ' + found)
            )
    );

    private static LITERAL_INCORRECT = memo(
        () => new DynamicCommandExceptionType((expected) => new LiteralMessage('Expected literal ' + expected))
    );

    private static READER_EXPECTED_START_OF_QUOTE = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Expected quote to start a string'))
    );

    private static READER_EXPECTED_END_OF_QUOTE = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Unclosed quoted string'))
    );

    private static READER_INVALID_ESCAPE = memo(
        () =>
            new DynamicCommandExceptionType(
                (character) => new LiteralMessage("Invalid escape sequence '" + character + "' in quoted string")
            )
    );

    private static READER_INVALID_BOOL = memo(
        () =>
            new DynamicCommandExceptionType(
                (value) => new LiteralMessage("Invalid bool, expected true or false but found '" + value + "'")
            )
    );

    private static READER_INVALID_INT = memo(
        () => new DynamicCommandExceptionType((value) => new LiteralMessage("Invalid integer '" + value + "'"))
    );

    private static READER_EXPECTED_INT = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Expected integer'))
    );

    private static READER_INVALID_FLOAT = memo(
        () => new DynamicCommandExceptionType((value) => new LiteralMessage("Invalid float '" + value + "'"))
    );

    private static READER_EXPECTED_FLOAT = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Expected float'))
    );

    private static READER_EXPECTED_BOOL = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Expected bool'))
    );

    private static READER_EXPECTED_SYMBOL = memo(
        () => new DynamicCommandExceptionType((symbol) => new LiteralMessage("Expected '" + symbol + "'"))
    );

    private static DISPATCHER_UNKNOWN_COMMAND = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Unknown command'))
    );

    private static DISPATCHER_UNKNOWN_ARGUMENT = memo(
        () => new SimpleCommandExceptionType(new LiteralMessage('Incorrect argument for command'))
    );

    private static DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR = memo(
        () =>
            new SimpleCommandExceptionType(
                new LiteralMessage('Expected whitespace to end one argument, but found trailing data')
            )
    );

    private static DISPATCHER_PARSE_EXCEPTION = memo(
        () => new DynamicCommandExceptionType((message) => new LiteralMessage('Could not parse command: ' + message))
    );

    public floatTooLow(): DynamicCommandExceptionType {
        return BuiltInExceptions.FLOAT_TOO_SMALL();
    }

    public floatTooHigh(): DynamicCommandExceptionType {
        return BuiltInExceptions.FLOAT_TOO_BIG();
    }

    public integerTooLow(): DynamicCommandExceptionType {
        return BuiltInExceptions.INTEGER_TOO_SMALL();
    }

    public integerTooHigh(): DynamicCommandExceptionType {
        return BuiltInExceptions.INTEGER_TOO_BIG();
    }

    public literalIncorrect(): DynamicCommandExceptionType {
        return BuiltInExceptions.LITERAL_INCORRECT();
    }

    public readerExpectedStartOfQuote(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_START_OF_QUOTE();
    }

    public readerExpectedEndOfQuote(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_END_OF_QUOTE();
    }

    public readerInvalidEscape(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_ESCAPE();
    }

    public readerInvalidBool(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_BOOL();
    }

    public readerInvalidInt(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_INT();
    }

    public readerExpectedInt(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_INT();
    }

    public readerInvalidFloat(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_INVALID_FLOAT();
    }

    public readerExpectedFloat(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_FLOAT();
    }

    public readerExpectedBool(): SimpleCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_BOOL();
    }

    public readerExpectedSymbol(): DynamicCommandExceptionType {
        return BuiltInExceptions.READER_EXPECTED_SYMBOL();
    }

    public dispatcherUnknownCommand(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_UNKNOWN_COMMAND();
    }

    public dispatcherUnknownArgument(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_UNKNOWN_ARGUMENT();
    }

    public dispatcherExpectedArgumentSeparator(): SimpleCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR();
    }

    public dispatcherParseException(): DynamicCommandExceptionType {
        return BuiltInExceptions.DISPATCHER_PARSE_EXCEPTION();
    }
}
