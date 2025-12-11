import LiteralMessage from '../LiteralMessage';
import type BuiltInExceptionProvider from './BuiltInExceptionProvider';
import SimpleCommandExceptionType from './SimpleCommandExceptionType';
import DynamicCommandExceptionType from './DynamicCommandExceptionType';

// Lazy initialization holders to avoid circular dependency at module load time
let _FLOAT_TOO_SMALL: DynamicCommandExceptionType | null = null;
let _FLOAT_TOO_BIG: DynamicCommandExceptionType | null = null;
let _INTEGER_TOO_SMALL: DynamicCommandExceptionType | null = null;
let _INTEGER_TOO_BIG: DynamicCommandExceptionType | null = null;
let _LITERAL_INCORRECT: DynamicCommandExceptionType | null = null;
let _READER_EXPECTED_START_OF_QUOTE: SimpleCommandExceptionType | null = null;
let _READER_EXPECTED_END_OF_QUOTE: SimpleCommandExceptionType | null = null;
let _READER_INVALID_ESCAPE: DynamicCommandExceptionType | null = null;
let _READER_INVALID_BOOL: DynamicCommandExceptionType | null = null;
let _READER_INVALID_INT: DynamicCommandExceptionType | null = null;
let _READER_EXPECTED_INT: SimpleCommandExceptionType | null = null;
let _READER_INVALID_FLOAT: DynamicCommandExceptionType | null = null;
let _READER_EXPECTED_FLOAT: SimpleCommandExceptionType | null = null;
let _READER_EXPECTED_BOOL: SimpleCommandExceptionType | null = null;
let _READER_EXPECTED_SYMBOL: DynamicCommandExceptionType | null = null;
let _DISPATCHER_UNKNOWN_COMMAND: SimpleCommandExceptionType | null = null;
let _DISPATCHER_UNKNOWN_ARGUMENT: SimpleCommandExceptionType | null = null;
let _DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR: SimpleCommandExceptionType | null = null;
let _DISPATCHER_PARSE_EXCEPTION: DynamicCommandExceptionType | null = null;

export default class BuiltInExceptions implements BuiltInExceptionProvider {
    private static get FLOAT_TOO_SMALL() {
        return (_FLOAT_TOO_SMALL ??= new DynamicCommandExceptionType(
            (found, min) => new LiteralMessage('Float must not be less than ' + min + ', found ' + found)
        ));
    }

    private static get FLOAT_TOO_BIG() {
        return (_FLOAT_TOO_BIG ??= new DynamicCommandExceptionType(
            (found, max) => new LiteralMessage('Float must not be more than ' + max + ', found ' + found)
        ));
    }

    private static get INTEGER_TOO_SMALL() {
        return (_INTEGER_TOO_SMALL ??= new DynamicCommandExceptionType(
            (found, min) => new LiteralMessage('Integer must not be less than ' + min + ', found ' + found)
        ));
    }

    private static get INTEGER_TOO_BIG() {
        return (_INTEGER_TOO_BIG ??= new DynamicCommandExceptionType(
            (found, max) => new LiteralMessage('Integer must not be more than ' + max + ', found ' + found)
        ));
    }

    private static get LITERAL_INCORRECT() {
        return (_LITERAL_INCORRECT ??= new DynamicCommandExceptionType(
            (expected) => new LiteralMessage('Expected literal ' + expected)
        ));
    }

    private static get READER_EXPECTED_START_OF_QUOTE() {
        return (_READER_EXPECTED_START_OF_QUOTE ??= new SimpleCommandExceptionType(
            new LiteralMessage('Expected quote to start a string')
        ));
    }

    private static get READER_EXPECTED_END_OF_QUOTE() {
        return (_READER_EXPECTED_END_OF_QUOTE ??= new SimpleCommandExceptionType(
            new LiteralMessage('Unclosed quoted string')
        ));
    }

    private static get READER_INVALID_ESCAPE() {
        return (_READER_INVALID_ESCAPE ??= new DynamicCommandExceptionType(
            (character) => new LiteralMessage("Invalid escape sequence '" + character + "' in quoted string")
        ));
    }

    private static get READER_INVALID_BOOL() {
        return (_READER_INVALID_BOOL ??= new DynamicCommandExceptionType(
            (value) => new LiteralMessage("Invalid bool, expected true or false but found '" + value + "'")
        ));
    }

    private static get READER_INVALID_INT() {
        return (_READER_INVALID_INT ??= new DynamicCommandExceptionType(
            (value) => new LiteralMessage("Invalid integer '" + value + "'")
        ));
    }

    private static get READER_EXPECTED_INT() {
        return (_READER_EXPECTED_INT ??= new SimpleCommandExceptionType(new LiteralMessage('Expected integer')));
    }

    private static get READER_INVALID_FLOAT() {
        return (_READER_INVALID_FLOAT ??= new DynamicCommandExceptionType(
            (value) => new LiteralMessage("Invalid float '" + value + "'")
        ));
    }

    private static get READER_EXPECTED_FLOAT() {
        return (_READER_EXPECTED_FLOAT ??= new SimpleCommandExceptionType(new LiteralMessage('Expected float')));
    }

    private static get READER_EXPECTED_BOOL() {
        return (_READER_EXPECTED_BOOL ??= new SimpleCommandExceptionType(new LiteralMessage('Expected bool')));
    }

    private static get READER_EXPECTED_SYMBOL() {
        return (_READER_EXPECTED_SYMBOL ??= new DynamicCommandExceptionType(
            (symbol) => new LiteralMessage("Expected '" + symbol + "'")
        ));
    }

    private static get DISPATCHER_UNKNOWN_COMMAND() {
        return (_DISPATCHER_UNKNOWN_COMMAND ??= new SimpleCommandExceptionType(new LiteralMessage('Unknown command')));
    }

    private static get DISPATCHER_UNKNOWN_ARGUMENT() {
        return (_DISPATCHER_UNKNOWN_ARGUMENT ??= new SimpleCommandExceptionType(
            new LiteralMessage('Incorrect argument for command')
        ));
    }

    private static get DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR() {
        return (_DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR ??= new SimpleCommandExceptionType(
            new LiteralMessage('Expected whitespace to end one argument, but found trailing data')
        ));
    }

    private static get DISPATCHER_PARSE_EXCEPTION() {
        return (_DISPATCHER_PARSE_EXCEPTION ??= new DynamicCommandExceptionType(
            (message) => new LiteralMessage('Could not parse command: ' + message)
        ));
    }

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
