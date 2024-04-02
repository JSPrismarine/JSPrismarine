import Message from "../Message"
import ImmutableStringReader from "../ImmutableStringReader"
import CommandExceptionType from "./CommandExceptionType"
import CommandSyntaxException from "./CommandSyntaxException";

export default class SimpleCommandExceptionType implements CommandExceptionType {
    
    private message: Message;
    
    public constructor (message: Message) {
		this.message = message;
		Error.captureStackTrace(this, SimpleCommandExceptionType)
    }
    
    public create(): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message)
    }
    
    public createWithContext(reader: ImmutableStringReader): CommandSyntaxException {
        return new CommandSyntaxException(this, this.message, reader.getString(), reader.getCursor());
    }
    
    public toString(): string {
        return this.message.getString();
    }
}
