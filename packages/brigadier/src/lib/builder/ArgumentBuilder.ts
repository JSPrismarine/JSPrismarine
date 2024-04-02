import Command from '../Command';
import RedirectModifier from '../RedirectModifier';
import SingleRedirectModifier from '../SingleRedirectModifier';
import CommandNode from '../tree/CommandNode';
import RootCommandNode from '../tree/RootCommandNode';
import Predicate from '../Predicate';
import CommandContext from '../context/CommandContext';

abstract class ArgumentBuilder<S, T extends ArgumentBuilder<S, T>> {
    private args: RootCommandNode<S> = new RootCommandNode();

    private command!: Command<S>;

    private requirement!: Predicate<S>;

    private target!: CommandNode<S>;

    private modifier: RedirectModifier<S> | null = null;

    private forks!: boolean;

    public abstract getThis(): T;

    public then(arg: ArgumentBuilder<S, any> | CommandNode<S>): T {
        if (!(this.target == null)) {
            throw new Error('Cannot add children to a redirected node');
        }

        if (arg instanceof CommandNode) this.args.addChild(arg);
        else this.args.addChild(arg.build());

        return this.getThis();
    }

    public getArguments(): Iterable<CommandNode<S>> {
        return this.args.getChildren();
    }

    public executes(command: Command<S>): T {
        this.command = command;
        return this.getThis();
    }

    public getCommand(): Command<S> {
        return this.command;
    }

    public requires(requirement: Predicate<S>): T {
        this.requirement = requirement;
        return this.getThis();
    }

    public getRequirement(): Predicate<S> {
        return this.requirement;
    }

    public redirect(target: CommandNode<S>, modifier?: SingleRedirectModifier<S>): T {
        return this.forward(target, modifier == null ? null : (o: CommandContext<S>) => [modifier.apply(o)], false);
    }

    public fork(target: CommandNode<S>, modifier: RedirectModifier<S>): T {
        return this.forward(target, modifier, true);
    }

    public forward(target: CommandNode<S>, modifier: RedirectModifier<S> | null, fork: boolean): T {
        if (this.args.getChildrenCount() > 0) {
            throw new Error('Cannot forward a node with children');
        }

        this.target = target;
        this.modifier = modifier;
        this.forks = fork;
        return this.getThis();
    }

    public getRedirect(): CommandNode<S> {
        return this.target;
    }

    public getRedirectModifier() {
        return this.modifier;
    }

    public isFork(): boolean {
        return this.forks;
    }

    public abstract build(): CommandNode<S>;
}

export default ArgumentBuilder;
