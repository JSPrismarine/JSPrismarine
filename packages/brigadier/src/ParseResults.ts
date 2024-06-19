import type CommandContextBuilder from './context/CommandContextBuilder';
import type CommandSyntaxException from './exceptions/CommandSyntaxException';
import type CommandNode from './tree/CommandNode';
import type ImmutableStringReader from './ImmutableStringReader';
import StringReader from './StringReader';

export default class ParseResults<S> {
    private context: CommandContextBuilder<S>;

    private exceptions: Map<CommandNode<S>, CommandSyntaxException>;

    private reader: ImmutableStringReader;

    public constructor(
        context: CommandContextBuilder<S>,
        reader?: ImmutableStringReader,
        exceptions?: Map<CommandNode<S>, CommandSyntaxException>
    ) {
        this.context = context;
        this.reader = reader || new StringReader('');
        this.exceptions = exceptions || new Map<CommandNode<S>, CommandSyntaxException>();
    }

    public getContext(): CommandContextBuilder<S> {
        return this.context;
    }

    public getReader(): ImmutableStringReader {
        return this.reader;
    }

    public getExceptions(): Map<CommandNode<S>, CommandSyntaxException> {
        return this.exceptions;
    }
}
