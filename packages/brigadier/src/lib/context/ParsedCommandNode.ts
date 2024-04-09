import type CommandNode from '../tree/CommandNode';
import type StringRange from './StringRange';

export default class ParsedCommandNode<S> {
    private node: CommandNode<S>;
    private range: StringRange;

    public constructor(node: CommandNode<S>, range: StringRange) {
        this.node = node;
        this.range = range;
    }

    public getNode(): CommandNode<S> {
        return this.node;
    }

    public getRange(): StringRange {
        return this.range;
    }

    public toString(): String {
        return this.node + '@' + this.range;
    }

    public equals(o: object): boolean {
        if (this === o) return true;

        if (o == null || !(o instanceof ParsedCommandNode)) {
            return false;
        }

        return this.node.equals(o.node) && this.range.equals(o.range);
    }
}
