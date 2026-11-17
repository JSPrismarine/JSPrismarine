import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/brigadier` throws. */
export const BrigadierErrors = defineErrors('brigadier', {
    /**
     * Command suggestions were asked for at a position before the first parsed node. This is a bug
     * in the caller of Brigadier.
     */
    CannotFindNodeBeforeCursor: "Can't find node before cursor",
    /**
     * A command builder that redirects to another node was given children, which a redirect never
     * reaches. Build the children on the target node.
     */
    CannotAddChildrenToRedirectedNode: 'Cannot add children to a redirected node',
    /** A root node was added as another node's child. A command tree has one root. */
    RootNodeAsChild: 'Cannot add a RootCommandNode as a child to any other CommandNode',
    /** Code asked the root node for a builder; only literal and argument nodes have one. */
    CannotConvertRootIntoBuilder: 'Cannot convert root into a builder',
    /**
     * A command builder that already has children was made to forward to another node. A node
     * either runs its children or forwards, not both.
     */
    CannotForwardNodeWithChildren: 'Cannot forward a node with children',
    /**
     * A command body read an argument by a name its command does not declare. The name in the body
     * and the name in the command's definition differ.
     */
    UnknownArgument: "No such argument '{name}' exists on this command",
    /** A command did not parse. The message is Brigadier's own, such as `Expected integer`, followed by where in the input it stopped, and is shown to whoever ran the command. */
    CommandSyntax: '{message}'
});
