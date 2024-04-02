import isEqual from '../util/isEqual';
import type Message from '../Message';
import type StringRange from '../context/StringRange';

export default class Suggestion {
    private range: StringRange;
    private text: string;
    private tooltip: Message | null = null;

    public constructor(range: StringRange, text: string, tooltip: Message | null = null) {
        this.range = range;
        this.text = text;
        this.tooltip = tooltip;
    }

    public getRange(): StringRange {
        return this.range;
    }

    public getText(): string {
        return this.text;
    }

    public getTooltip() {
        return this.tooltip;
    }

    public apply(input: string): string {
        if (this.range.getStart() === 0 && this.range.getEnd() == input.length) {
            return this.text;
        }

        let result = '';
        if (this.range.getStart() > 0) {
            result += input.substring(0, this.range.getStart());
        }

        result += this.text;
        if (this.range.getEnd() < input.length) {
            result += input.substring(this.range.getEnd());
        }

        return result;
    }

    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof Suggestion)) return false;

        return isEqual(this.range, o.range) && this.text === o.text && isEqual(this.tooltip, o.tooltip);
    }

    public toString(): String {
        return (
            'Suggestion{' +
            'range=' +
            this.range +
            ", text='" +
            this.text +
            "'" +
            ", tooltip='" +
            this.tooltip +
            "'" +
            '}'
        );
    }

    public compareTo(o: Suggestion): number {
        return this.text < o.text ? 1 : -1;
    }

    public compareToIgnoreCase(b: Suggestion): number {
        return this.text.toLowerCase() < b.text.toLowerCase() ? 1 : -1;
    }

    public expand(command: string, range: StringRange): Suggestion {
        if (range.equals(this.range)) {
            return this;
        }

        let result = '';
        if (range.getStart() < this.range.getStart()) {
            result += command.substring(range.getStart(), this.range.getStart());
        }

        result += this.text;
        if (range.getEnd() > this.range.getEnd()) {
            result += command.substring(this.range.getEnd(), range.getEnd());
        }

        return new Suggestion(range, result, this.tooltip);
    }
}
