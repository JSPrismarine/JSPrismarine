import Message from "../Message"
import StringRange from "../context/StringRange"
import Suggestion from "./Suggestion"
import Suggestions from "./Suggestions"
import IntegerSuggestion from "./IntegerSuggestion"

export default class SuggestionsBuilder {
    
    private input: string;
    
    private start: number;
    
    private remaining: string;
    
    private result: Array<Suggestion> = [];
    
    public constructor (input: string, start: number) {
        this.input = input;
        this.start = start;
        this.remaining = input.substring(start);
    }
    
    public getInput(): String {
        return this.input;
    }
    
    public getStart(): number {
        return this.start;
    }
    
    public getRemaining(): string {
        return this.remaining;
    }
    
    public build(): Suggestions {
        return Suggestions.create(this.input, this.result);
    }
    
    public buildPromise(): Promise<Suggestions> {
        return Promise.resolve(this.build());
    }
    
    public suggest(text: string | number, tooltip: Message = null): SuggestionsBuilder {

		if(typeof text === "number") {
			this.result.push(new IntegerSuggestion(StringRange.between(this.start, this.input.length), text, tooltip));
			return this;
		}

        if (text === this.remaining)
            return this;
        
        this.result.push(new Suggestion(StringRange.between(this.start, this.input.length), text, tooltip));
        return this;
    }        
    
    public add(other: SuggestionsBuilder): SuggestionsBuilder {
        this.result.push(...other.result);
        return this;
    }
    
    public createOffset(start: number): SuggestionsBuilder {
        return new SuggestionsBuilder(this.input, this.start);
    }
    
    public restart(): SuggestionsBuilder {
        return new SuggestionsBuilder(this.input, this.start);
    }
}