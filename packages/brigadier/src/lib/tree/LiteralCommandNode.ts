import type Command from '../Command';
import CommandNode from './CommandNode';
import type Predicate from '../Predicate';
import type RedirectModifier from '../RedirectModifier';
import StringReader from '../StringReader';
import LiteralArgumentBuilder from '../builder/LiteralArgumentBuilder';
import type CommandContext from '../context/CommandContext';
import type CommandContextBuilder from '../context/CommandContextBuilder';
import StringRange from '../context/StringRange';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';
import Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';

export default class LiteralCommandNode<S> extends CommandNode<S> {
    private literal: string;

    public constructor(
        literal: string,
        command: Command<S>,
        requirement: Predicate<S>,
        redirect: CommandNode<S>,
        modifier: RedirectModifier<S> | null,
        forks: boolean
    ) {
        super(command, requirement, redirect, modifier, forks);
        this.literal = literal;
    }

    public getNodeType(): string {
        return 'literal';
    }

    public getLiteral(): string {
        return this.literal;
    }

    public getName(): string {
        return this.literal;
    }

    public parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>) {
        let start = reader.getCursor();
        let end = this.__parse(reader);
        if (end > -1) {
            contextBuilder.withNode(this, StringRange.between(start, end));
            return;
        }

        throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.literalIncorrect().createWithContext(reader, this.literal);
    }

    private __parse(reader: StringReader): number {
        let start = reader.getCursor();
        if (reader.canRead(this.literal.length)) {
            let end = start + this.literal.length;
            if (reader.getString().substring(start, end) === this.literal) {
                reader.setCursor(end);
                if (!reader.canRead() || reader.peek() == ' ') {
                    return end;
                } else {
                    reader.setCursor(start);
                }
            }
        }
        return -1;
    }

    public listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions> {
        if (this.literal.toLowerCase().startsWith(builder.getRemaining().toLowerCase())) {
            return builder.suggest(this.literal).buildPromise();
        } else {
            return Suggestions.empty();
        }
    }

    public isValidInput(input: string): boolean {
        return this.__parse(new StringReader(input)) > -1;
    }

    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof LiteralCommandNode)) return false;

        if (this.literal !== o.literal) return false;

        return super.equals(o);
    }

    public getUsageText(): string {
        return this.literal;
    }

    public createBuilder(): LiteralArgumentBuilder<S> {
        let builder: LiteralArgumentBuilder<S> = LiteralArgumentBuilder.literal(this.literal);
        builder.requires(this.getRequirement());
        builder.forward(this.getRedirect()!, this.getRedirectModifier(), this.isFork());
        if (this.getCommand() != null) builder.executes(this.getCommand()!);

        return builder;
    }

    public getSortedKey(): string {
        return this.literal;
    }

    public getExamples(): Iterable<string> {
        return [this.literal];
    }

    public toString(): string {
        return '<literal ' + this.literal + '>';
    }
}
