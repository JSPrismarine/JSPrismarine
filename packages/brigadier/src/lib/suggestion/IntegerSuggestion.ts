import type Message from '../Message';
import type StringRange from '../context/StringRange';
import Suggestion from './Suggestion';

export default class IntegerSuggestion extends Suggestion {
    private value: number;

    public constructor(range: StringRange, value: number, tooltip: Message | null = null) {
        super(range, value.toString(), tooltip);
        this.value = value;
    }

    public getValue(): number {
        return this.value;
    }

    public equals(o: object): boolean {
        if (this === o) return true;

        if (!(o instanceof IntegerSuggestion)) return false;

        return this.value == o.value && super.equals(o);
    }

    public toString(): String {
        return (
            'IntegerSuggestion{' +
            'value=' +
            this.value +
            ', range=' +
            this.getRange() +
            ", text='" +
            this.getText() +
            "'" +
            ", tooltip='" +
            this.getTooltip() +
            "'" +
            '}'
        );
    }

    public compareTo(o: Suggestion): number {
        if (o instanceof IntegerSuggestion) {
            return this.value < o.value ? 1 : -1;
        }

        return super.compareTo(o);
    }

    public compareToIgnoreCase(b: Suggestion): number {
        return this.compareTo(b);
    }
}
