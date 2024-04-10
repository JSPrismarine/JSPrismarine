import type Command from '../Command';
import type Predicate from '../Predicate';
import type RedirectModifier from '../RedirectModifier';
import StringReader from '../StringReader';
import type ArgumentType from '../arguments/ArgumentType';
import RequiredArgumentBuilder from '../builder/RequiredArgumentBuilder';
import type CommandContext from '../context/CommandContext';
import type CommandContextBuilder from '../context/CommandContextBuilder';
import ParsedArgument from '../context/ParsedArgument';
import type SuggestionProvider from '../suggestion/SuggestionProvider';
import Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import isEqual from '../util/isEqual';
import CommandNode from './CommandNode';

const USAGE_ARGUMENT_OPEN: string = '<';
const USAGE_ARGUMENT_CLOSE: string = '>';

export default class ArgumentCommandNode<S, T> extends CommandNode<S> {
    private name: string;
    private type: ArgumentType<T>;
    private customSuggestions: SuggestionProvider<S>;

    public constructor(
        name: string,
        type: ArgumentType<T>,
        command: Command<S>,
        requirement: Predicate<S>,
        redirect: CommandNode<S> | null,
        modifier: RedirectModifier<S> | null,
        forks: boolean,
        customSuggestions: SuggestionProvider<S>
    ) {
        super(command, requirement, redirect, modifier, forks);
        this.name = name;
        this.type = type;
        this.customSuggestions = customSuggestions;
    }

    public getNodeType(): string {
        return 'argument';
    }

    public getType(): ArgumentType<T> {
        return this.type;
    }

    public getName(): string {
        return this.name;
    }

    public getUsageText(): string {
        return USAGE_ARGUMENT_OPEN + this.name + USAGE_ARGUMENT_CLOSE;
    }

    public getCustomSuggestions(): SuggestionProvider<S> {
        return this.customSuggestions;
    }

    public parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>) {
        let start = reader.getCursor();
        let result: T = this.type.parse(reader, contextBuilder as any);
        let parsed: ParsedArgument<S, T> = new ParsedArgument(start, reader.getCursor(), result);
        contextBuilder.withArgument(this.name, parsed);
        contextBuilder.withNode(this, parsed.getRange());
    }

    public listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions> {
        if (this.customSuggestions == null) {
            if (typeof this.type.listSuggestions === 'function') return this.type.listSuggestions(context, builder);
            else return Suggestions.empty();
        } else {
            return this.customSuggestions.getSuggestions(context, builder);
        }
    }

    public createBuilder(): RequiredArgumentBuilder<S, T> {
        let builder: RequiredArgumentBuilder<S, T> = RequiredArgumentBuilder.argument(
            this.name,
            this.type
        ) as RequiredArgumentBuilder<S, T>;
        builder.requires(this.getRequirement());
        builder.forward(this.getRedirect()!, this.getRedirectModifier(), this.isFork());
        builder.suggests(this.customSuggestions);
        if (this.getCommand()) {
            builder.executes(this.getCommand()!);
        }

        return builder;
    }

    public isValidInput(input: string, context: any): boolean {
        try {
            let reader: StringReader = new StringReader(input);
            this.type.parse(reader, context);
            return !reader.canRead() || reader.peek() == ' ';
        } catch (ignored) {}

        return false;
    }

    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof ArgumentCommandNode)) return false;

        if (!(this.name === o.name)) return false;
        if (!isEqual(this.type, o.type)) return false;

        return super.equals.bind(this)(o);
    }

    public getSortedKey(): string {
        return this.name;
    }

    public getExamples(): Iterable<string> {
        return typeof this.type.getExamples === 'function' ? this.type.getExamples() : [];
    }

    public toString(): string {
        return '<argument ' + this.name + ':' + this.type + '>';
    }
}
