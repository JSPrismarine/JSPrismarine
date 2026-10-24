import BoolArgumentType from './BoolArgumentType';
import type CommandContext from '../context/CommandContext';
import type CommandContextBuilder from '../context/CommandContextBuilder';
import FloatArgumentType from './FloatArgumentType';
import IntegerArgumentType from './IntegerArgumentType';
import StringArgumentType from './StringArgumentType';
import type StringReader from '../StringReader';
import type Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';

export const DefaultType = {
    bool: BoolArgumentType.bool,
    integer: IntegerArgumentType.integer,
    float: FloatArgumentType.float,
    word: StringArgumentType.word,
    string: StringArgumentType.string,
    greedyString: StringArgumentType.greedyString
};

/**
 * What an argument type can read from the command being parsed. The dispatcher
 * passes its `CommandContextBuilder`, which is still being filled in, so only
 * the command source is available at this point.
 */
export type ArgumentParseContext<S> = Pick<CommandContextBuilder<S>, 'getSource'>;

export default interface ArgumentType<T> {
    parse(reader: StringReader, context: ArgumentParseContext<any>): T;

    listSuggestions?<S>(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions>;

    getExamples?(): Iterable<string>;
}
