import type Command from '../Command';
import type RedirectModifier from '../RedirectModifier';
import type SingleRedirectModifier from '../SingleRedirectModifier';
import CommandNode from '../tree/CommandNode';
import RootCommandNode from '../tree/RootCommandNode';
import type Predicate from '../Predicate';
import type CommandContext from '../context/CommandContext';
import { BrigadierErrors } from '@jsprismarine/errors/brigadier';

/** Builds a command node: its children, the command it runs, its requirement and where it redirects. */
abstract class ArgumentBuilder<S, T extends ArgumentBuilder<S, T>> {
    private args: RootCommandNode<S> = new RootCommandNode();

    private command!: Command<S>;

    private requirement!: Predicate<S>;

    private target: CommandNode<S> | null = null;

    private modifier: RedirectModifier<S> | null = null;

    private forks!: boolean;

    /** Returns this builder as its concrete type, so the chained methods keep it. */
    public abstract getThis(): T;

    /** Adds a child node, or the node a child builder builds. Throws on a builder that redirects. */
    public then(arg: ArgumentBuilder<S, any> | CommandNode<S>): T {
        if (this.target != null) {
            throw new BrigadierErrors.CannotAddChildrenToRedirectedNode();
        }

        if (arg instanceof CommandNode) this.args.addChild(arg);
        else this.args.addChild(arg.build());

        return this.getThis();
    }

    /** Returns the child nodes added so far. */
    public getArguments(): Iterable<CommandNode<S>> {
        return this.args.getChildren();
    }

    /** Sets the command the node runs when the input ends on it. */
    public executes(command: Command<S>): T {
        this.command = command;
        return this.getThis();
    }

    /** Returns the command the node runs. */
    public getCommand(): Command<S> {
        return this.command;
    }

    /** Sets the predicate a source must pass to use the node. */
    public requires(requirement: Predicate<S>): T {
        this.requirement = requirement;
        return this.getThis();
    }

    /** Returns the predicate a source must pass to use the node. */
    public getRequirement(): Predicate<S> {
        return this.requirement;
    }

    /** Sends the rest of the input to `target`, optionally changing the source on the way. */
    public redirect(target: CommandNode<S>, modifier?: SingleRedirectModifier<S>): T {
        return this.forward(
            target,
            modifier == null ? null : { apply: (context: CommandContext<S>) => [modifier.apply(context)] },
            false
        );
    }

    /** Sends the rest of the input to `target` once for each source `modifier` returns. */
    public fork(target: CommandNode<S>, modifier: RedirectModifier<S>): T {
        return this.forward(target, modifier, true);
    }

    /** Sets the redirect target, its source modifier and whether it forks. Throws on a builder with children. */
    public forward(target: CommandNode<S>, modifier: RedirectModifier<S> | null, fork: boolean): T {
        if (this.args.getChildrenCount() > 0) {
            throw new BrigadierErrors.CannotForwardNodeWithChildren();
        }

        this.target = target;
        this.modifier = modifier;
        this.forks = fork;
        return this.getThis();
    }

    /** Returns the node the input is redirected to, or null. */
    public getRedirect() {
        return this.target;
    }

    /** Returns the modifier applied to the source on a redirect, or null. */
    public getRedirectModifier() {
        return this.modifier;
    }

    /** Returns whether the redirect runs once for each source the modifier returns. */
    public isFork(): boolean {
        return this.forks;
    }

    /** Builds the node. */
    public abstract build(): CommandNode<S>;
}

export default ArgumentBuilder;
