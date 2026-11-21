import type AmbiguityConsumer from '../AmbiguityConsumer';
import type ArgumentBuilder from '../builder/ArgumentBuilder';
import type Command from '../Command';
import type CommandContext from '../context/CommandContext';
import type CommandContextBuilder from '../context/CommandContextBuilder';
import type Predicate from '../Predicate';
import type RedirectModifier from '../RedirectModifier';
import type StringReader from '../StringReader';
import type Suggestions from '../suggestion/Suggestions';
import type SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import isEqual from '../util/isEqual';
import { BrigadierErrors } from '@jsprismarine/errors/brigadier';

/** One node of a command tree: a literal, an argument or the root, with its children. */
abstract class CommandNode<S> {
    private children: Map<string, CommandNode<S>> = new Map();

    private literals: Map<string, any> = new Map();

    private args: Map<string, any> = new Map();

    private requirement: Predicate<S>;

    private redirect: CommandNode<S> | null = null;

    private modifier: RedirectModifier<S> | null = null;

    private forks: boolean;

    private command: Command<S> | null = null;

    /** Returns the kind of node: `literal`, `argument` or `root`. */
    public abstract getNodeType(): string;

    public constructor(
        command: Command<S> | null,
        requirement: Predicate<S> | null,
        redirect: CommandNode<S> | null,
        modifier: RedirectModifier<S> | null,
        forks: boolean
    ) {
        this.command = command;
        this.requirement = requirement || (() => true);
        this.redirect = redirect;
        this.modifier = modifier;
        this.forks = forks;
    }

    /** Returns the command the node runs, or null when the input cannot end on it. */
    public getCommand() {
        return this.command;
    }

    /** Returns the child nodes, literals before arguments. */
    public getChildren() {
        return this.children.values();
    }

    /** Returns how many children the node has. */
    public getChildrenCount(): number {
        return this.children.size;
    }

    /** Returns the child with the given name, if there is one. */
    public getChild(name: string) {
        return this.children.get(name);
    }

    /** Returns the node the input is redirected to, or null. */
    public getRedirect() {
        return this.redirect;
    }

    /** Returns the modifier applied to the source on a redirect, or null. */
    public getRedirectModifier() {
        return this.modifier;
    }

    /** Returns whether `source` passes the node's requirement. */
    public canUse(source: S): boolean {
        return this.requirement(source);
    }

    /** Adds a child, merging it into an existing child of the same name. Throws for a root node. */
    public addChild(node: CommandNode<S>) {
        if (node.getNodeType() === 'root') {
            throw new BrigadierErrors.RootNodeAsChild();
        }

        let child = this.children.get(node.getName());
        if (child != null) {
            //  We've found something to merge onto
            if (node.getCommand() != null) {
                child.command = node.getCommand();
            }

            for (let grandchild of node.getChildren()) {
                child.addChild(grandchild);
            }
        } else {
            this.children.set(node.getName(), node);
            if (node.getNodeType() === 'literal') {
                this.literals.set(node.getName(), node);
            } else if (node.getNodeType() === 'argument') {
                this.args.set(node.getName(), node);
            }
        }

        this.children = new Map([...this.children.entries()].sort((a, b) => a[1].compareTo(b[1])));
    }

    /** Reports each pair of sibling nodes, at any depth, that accept the same example input. */
    public findAmbiguities(consumer: AmbiguityConsumer<S>, context: any) {
        let matches: Array<string> = [];
        for (let child of this.children.values()) {
            for (let sibling of this.children.values()) {
                if (child === sibling) {
                    continue;
                }

                for (let input of child.getExamples()) {
                    if (sibling.isValidInput(input, context)) {
                        matches.push(input);
                    }
                }

                if (matches.length > 0) {
                    consumer.ambiguous(this, child, sibling, matches);
                    matches = [];
                }
            }

            child.findAmbiguities(consumer, context);
        }
    }

    /** Returns whether the node accepts `input`. */
    public abstract isValidInput(input: string, context: any): boolean;

    /** Returns whether `o` is a node with equal children and an equal command. */
    public equals(o: object): boolean {
        if (this === o) return true;
        if (!(o instanceof CommandNode)) return false;

        if (this.children.size !== o.children.size) {
            return false;
        }

        if (!isEqual(this.children, o.children)) return false;

        if (this.command != null ? !isEqual(this.command, o.command) : o.command != null) return false;

        return true;
    }

    /** Returns the predicate a source must pass to use the node. */
    public getRequirement() {
        return this.requirement;
    }

    /** Returns the node's name, which is unique among its siblings. */
    public abstract getName(): string;

    /** Returns how the node appears in a usage string. */
    public abstract getUsageText(): string;

    /** Parses the node's part of the input into the context. Throws on input the node rejects. */
    public abstract parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>): void;

    /** Returns the completions the node offers for the input. */
    public abstract listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions>;

    /** Returns a builder that builds a copy of the node. */
    public abstract createBuilder(): ArgumentBuilder<S, any>;

    /** Returns the key the node sorts by among siblings of the same kind. */
    public abstract getSortedKey(): string;

    /** Returns the children worth trying for the next word: the literal it names, or else every argument. */
    public getRelevantNodes(input: StringReader): Iterable<CommandNode<S>> {
        if (this.literals.size > 0) {
            let cursor: number = input.getCursor();
            while (input.canRead() && input.peek() != ' ') {
                input.skip();
            }

            let text = input.getString().substring(cursor, input.getCursor());
            input.setCursor(cursor);
            let literal = this.literals.get(text);
            if (literal != null) {
                return [literal];
            } else {
                return this.args.values();
            }
        } else {
            return this.args.values();
        }
    }

    /** Orders literals before arguments, and nodes of one kind by their sorted keys. */
    public compareTo(o: CommandNode<S>): number {
        if (this.getNodeType() === o.getNodeType()) {
            return this.getSortedKey() > o.getSortedKey() ? 1 : -1;
        }

        return o.getNodeType() === 'literal' ? 1 : -1;
    }

    /** Returns whether the redirect runs once for each source the modifier returns. */
    public isFork(): boolean {
        return this.forks;
    }

    /** Returns sample inputs the node accepts, for finding ambiguities. */
    public abstract getExamples(): Iterable<string>;
}

export default CommandNode;
