import isEqual from "../util/isEqual"
import StringRange from "../context/StringRange"
import Suggestion from "./Suggestion"

export default class Suggestions {

    private static EMPTY = new Suggestions(StringRange.at(0), []);

    private range: StringRange;

    private suggestions: Array<Suggestion>;

    public constructor (range: StringRange, suggestions: Array<Suggestion>) {
        this.range = range;
        this.suggestions = suggestions;
    }

    public getRange(): StringRange {
        return this.range;
    }

    public getList(): Array<Suggestion> {
        return this.suggestions;
    }

    public isEmpty(): boolean {
        return this.suggestions.length === 0;
    }

    public equals(o: object): boolean {
        if (this === o) return true;

        if (!(o instanceof  Suggestions)) return false;

        return this.range.equals(o.range) && isEqual(this.suggestions, o.suggestions);
    }

    public toString(): String {
		return "Suggestions{" +
		"range=" + this.range +
		", suggestions=" + this.suggestions + '}';
    }

    public static empty(): Promise<Suggestions> {
        return Promise.resolve(this.EMPTY);
    }

    public static merge(command: string, input: Array<Suggestions>): Suggestions {
        if (input.length === 0) {
            return this.EMPTY;
        }
        else if (input.length === 1) {
            return input[0];
        }

        const texts = [];
        for (let suggestions of input) {
            texts.push(...suggestions.getList());
        }

        return Suggestions.create(command, texts);
    }

    public static create(command: string, suggestions: Array<Suggestion>): Suggestions {
        if (suggestions.length === 0) {
            return this.EMPTY;
        }

        let start = Infinity;
        let end = -Infinity;
        for (let suggestion of suggestions) {
            start = Math.min(suggestion.getRange().getStart(), start);
            end = Math.max(suggestion.getRange().getEnd(), end);
        }

        let range = new StringRange(start, end);
        const texts = [];
        for (let suggestion of suggestions) {
            texts.push(suggestion.expand(command, range));
        }

        const sorted = texts.sort((a, b) => a.compareToIgnoreCase(b));
        return new Suggestions(range, sorted);
    }
}