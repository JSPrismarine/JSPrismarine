import type StringReader from '../StringReader';
import type CommandContext from '../context/CommandContext';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';
import type ArgumentType from './ArgumentType';

const EXAMPLES = ['0', '123', '-123'];

export default class IntegerArgumentType implements ArgumentType<number> {
    private minimum: number;
    private maximum: number;

    private constructor(minimum: number, maximum: number) {
        this.minimum = minimum;
        this.maximum = maximum;
    }

    public static integer(min: number = -Infinity, max: number = Infinity): IntegerArgumentType {
        return new IntegerArgumentType(min, max);
    }

    public static getInteger(context: CommandContext<any>, name: string): number {
        return context.getArgument(name, Number);
    }

    public getMinimum(): number {
        return this.minimum;
    }

    public getMaximum(): number {
        return this.maximum;
    }

    public parse(reader: StringReader): number {
        let start = reader.getCursor();
        let result = reader.readInt();
        if (result < this.minimum) {
            reader.setCursor(start);
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.integerTooLow().createWithContext(
                reader,
                result,
                this.minimum
            );
        }

        if (result > this.maximum) {
            reader.setCursor(start);
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.integerTooHigh().createWithContext(
                reader,
                result,
                this.maximum
            );
        }

        return result;
    }

    public equals(o: object): boolean {
        if (this === o) return true;

        if (!(o instanceof IntegerArgumentType)) return false;

        return this.maximum == o.maximum && this.minimum == o.minimum;
    }

    public toString(): string {
        if (this.minimum === -Infinity && this.maximum === Infinity) {
            return 'integer()';
        } else if (this.maximum == Infinity) {
            return 'integer(' + this.minimum + ')';
        } else {
            return 'integer(' + this.minimum + ', ' + this.maximum + ')';
        }
    }

    public getExamples(): Iterable<string> {
        return EXAMPLES;
    }
}
