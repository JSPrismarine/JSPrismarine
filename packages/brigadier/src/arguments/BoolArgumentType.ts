import type StringReader from '../StringReader';
import type CommandContext from '../context/CommandContext';
import type Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import type ArgumentType from './ArgumentType';

const EXAMPLES = ['true', 'false'];

export default class BoolArgumentType implements ArgumentType<boolean> {
    private constructor() {}

    public static bool(): BoolArgumentType {
        return new BoolArgumentType();
    }

    public static getBool(context: CommandContext<any>, name: string): boolean {
        return context.getArgument(name, Boolean);
    }

    public parse(reader: StringReader): boolean {
        return reader.readBoolean();
    }

    public listSuggestions(context: CommandContext<any>, builder: SuggestionsBuilder): Promise<Suggestions> {
        if ('true'.startsWith(builder.getRemaining().toLowerCase())) {
            builder.suggest('true');
        }

        if ('false'.startsWith(builder.getRemaining().toLowerCase())) {
            builder.suggest('false');
        }

        return builder.buildPromise();
    }

    public getExamples(): Iterable<string> {
        return EXAMPLES;
    }
}
