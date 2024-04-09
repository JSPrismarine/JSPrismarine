import StringRange from './StringRange';

export default class ParsedArgument<S, T> {
    private range: StringRange;
    private result: T;

    public constructor(start: number, end: number, result: T) {
        this.range = StringRange.between(start, end);
        this.result = result;
    }

    public getRange(): StringRange {
        return this.range;
    }

    public getResult(): T {
        return this.result;
    }

    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof ParsedArgument)) return false;

        return this.range.equals(o.range) && this.result === o.result;
    }
}
