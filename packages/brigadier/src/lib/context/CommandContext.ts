import type Command from '../Command';
import type RedirectModifier from '../RedirectModifier';
import type CommandNode from '../tree/CommandNode';
import isEqual from '../util/isEqual';
import type ParsedArgument from './ParsedArgument';
import type ParsedCommandNode from './ParsedCommandNode';
import type StringRange from './StringRange';

export default class CommandContext<S> {
    private source: S;
    private input: string;
    private command: Command<S> | null;
    private args: Map<String, ParsedArgument<S, any>>;
    private rootNode: CommandNode<S>;
    private nodes: Array<ParsedCommandNode<S>>;
    private range: StringRange;
    private child: CommandContext<S> | null;
    private modifier: RedirectModifier<S> | null;
    private forks: boolean;

    public constructor(
        source: S,
        input: string,
        args: Map<String, ParsedArgument<S, any>>,
        command: Command<S> | null,
        rootNode: CommandNode<S> | null,
        nodes: Array<ParsedCommandNode<S>> | null,
        range: StringRange,
        child: CommandContext<S> | null,
        modifier: RedirectModifier<S> | null,
        forks: boolean
    ) {
        this.source = source;
        this.input = input;
        this.args = args;
        this.command = command;
        this.rootNode = rootNode!;
        this.nodes = nodes!;
        this.range = range;
        this.child = child;
        this.modifier = modifier;
        this.forks = forks;
    }

    public copyFor(source: S): CommandContext<S> {
        if (this.source === source) return this;

        return new CommandContext<S>(
            source,
            this.input,
            this.args,
            this.command,
            this.rootNode,
            this.nodes,
            this.range,
            this.child,
            this.modifier,
            this.forks
        );
    }

    public getChild() {
        return this.child;
    }

    public getLastChild(): CommandContext<S> | null {
        let result: CommandContext<S> = this;
        while (result.getChild()) {
            result = result.getChild() as any; // FIXME
        }
        return result;
    }

    public getCommand() {
        return this.command;
    }

    public getSource(): S {
        return this.source;
    }

    public getArgument(name: string, clazz?: Function): any {
        const arg: ParsedArgument<S, any> | null = this.args.get(name) ?? null; // FIXME

        if (arg == null) {
            throw new Error("No such argument '" + name + "' exists on this command");
        }

        let result = arg.getResult();
        if (clazz == null) {
            return result;
        } else {
            return clazz(result);
        }
    }

    public equals(o: object | null = null): boolean {
        if (this === o) return true;
        if (!(o instanceof CommandContext)) return false;

        if (!isEqual(this.args, o.args)) return false;
        if (!this.rootNode.equals(o.rootNode)) return false;
        if (this.nodes.length != o.nodes.length || !isEqual(this.nodes, o.nodes)) return false;
        if (this.command ? !isEqual(this.command, o.command) : o.command != null) return false;
        if (!isEqual(this.source, o.source)) return false;
        if (this.child ? !this.child.equals(o.child!) : o.child != null) return false;

        return true;
    }

    public getRedirectModifier() {
        return this.modifier;
    }

    public getRange(): StringRange {
        return this.range;
    }

    public getInput(): string {
        return this.input;
    }

    public getRootNode(): CommandNode<S> {
        return this.rootNode;
    }

    public getNodes(): Array<ParsedCommandNode<S>> {
        return this.nodes;
    }

    public hasNodes(): boolean {
        return this.nodes.length >= 0;
    }

    public isForked(): boolean {
        return this.forks;
    }
}
