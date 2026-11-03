import type CommandContextBuilder from './context/CommandContextBuilder';
import type CommandNode from './tree/CommandNode';
import type ImmutableStringReader from './ImmutableStringReader';
import StringReader from './StringReader';

export default class ParseResults<S> {
    private context: CommandContextBuilder<S>;

    private exceptions: Map<CommandNode<S>, Error>;

    private reader: ImmutableStringReader;

    public constructor(
        context: CommandContextBuilder<S>,
        reader?: ImmutableStringReader,
        exceptions?: Map<CommandNode<S>, Error>
    ) {
        this.context = context;
        this.reader = reader || new StringReader('');
        this.exceptions = exceptions || new Map<CommandNode<S>, Error>();
    }

    public getContext(): CommandContextBuilder<S> {
        return this.context;
    }

    public getReader(): ImmutableStringReader {
        return this.reader;
    }

    /**
     * Returns the error each child node raised while parsing, keyed by node.
     * Brigadier's own parsers throw `CommandSyntaxException`; argument types
     * supplied by callers may throw any `Error`.
     */
    public getExceptions(): Map<CommandNode<S>, Error> {
        return this.exceptions;
    }

    /**
     * Copies the parse for another source without running any argument parsers again.
     *
     * @param source - The source the resulting context tree should carry.
     */
    public copyFor(source: S): ParseResults<S> {
        return new ParseResults(this.context.copyFor(source), this.reader, new Map(this.exceptions));
    }
}
