import type Suggestions from './Suggestions';
import type SuggestionsBuilder from './SuggestionsBuilder';
import type CommandContext from '../context/CommandContext';

export default interface SuggestionProvider<S> {
    getSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions>;
}
