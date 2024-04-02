import type CommandNode from './tree/CommandNode';

export default interface AmbiguityConsumer<S> {
    ambiguous(parent: CommandNode<S>, child: CommandNode<S>, sibling: CommandNode<S>, inputs: Iterable<string>): void;
}
