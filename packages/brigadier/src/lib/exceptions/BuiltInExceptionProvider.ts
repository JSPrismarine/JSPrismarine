import DynamicCommandExceptionType from "./DynamicCommandExceptionType"
import SimpleCommandExceptionType from "./SimpleCommandExceptionType"

export default interface BuiltInExceptionProvider {		
	
	floatTooLow(): DynamicCommandExceptionType;
	
	floatTooHigh(): DynamicCommandExceptionType;
	
	integerTooLow(): DynamicCommandExceptionType;
	
	integerTooHigh(): DynamicCommandExceptionType;	
	
	literalIncorrect(): DynamicCommandExceptionType;
	
	readerExpectedStartOfQuote(): SimpleCommandExceptionType;
	
	readerExpectedEndOfQuote(): SimpleCommandExceptionType;
	
	readerInvalidEscape(): DynamicCommandExceptionType;
	
	readerInvalidBool(): DynamicCommandExceptionType;
	
	readerInvalidInt(): DynamicCommandExceptionType;
	
	readerExpectedInt(): SimpleCommandExceptionType;

	readerInvalidFloat(): DynamicCommandExceptionType;
	
	readerExpectedFloat(): SimpleCommandExceptionType;
	
	readerExpectedBool(): SimpleCommandExceptionType;
	
	readerExpectedSymbol(): DynamicCommandExceptionType;
	
	dispatcherUnknownCommand(): SimpleCommandExceptionType;
	
	dispatcherUnknownArgument(): SimpleCommandExceptionType;
	
	dispatcherExpectedArgumentSeparator(): SimpleCommandExceptionType;
	
	dispatcherParseException(): DynamicCommandExceptionType;		
}