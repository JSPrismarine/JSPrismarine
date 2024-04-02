import Suggestions from "./Suggestions"
import SuggestionsBuilder from "./SuggestionsBuilder"
import CommandContext from "../context/CommandContext"

export default interface SuggestionProvider<S> {    
    getSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions>;
}