import type StringReader from '../StringReader';
import type ArgumentBuilder from '../builder/ArgumentBuilder';
import type CommandContext from '../context/CommandContext';
import type CommandContextBuilder from '../context/CommandContextBuilder';
import Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import CommandNode from './CommandNode';

export default class RootCommandNode<S> extends CommandNode<S> {
    public constructor() {
        super(
            null,
            (_s) => true,
            null,
            (s: CommandContext<S>) => s.getSource(),
            false
        );
    }

    public getNodeType(): string {
        return 'root';
    }

    public getName(): string {
        return '';
    }

    public getUsageText(): string {
        return '';
    }

    public parse(_reader: StringReader, _contextBuilder: CommandContextBuilder<S>) {}

    public listSuggestions(_context: CommandContext<S>, _builder: SuggestionsBuilder): Promise<Suggestions> {
        return Suggestions.empty();
    }

    public isValidInput(_input: String): boolean {
        return false;
    }

    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof RootCommandNode)) return false;

        return super.equals.bind(this)(o);
    }

    public createBuilder(): ArgumentBuilder<S, any> {
        throw new Error('Cannot convert root into a builder');
    }

    public getSortedKey(): string {
        return '';
    }

    public getExamples(): Iterable<string> {
        return [];
    }

    public toString(): string {
        return '<root>';
    }
}
