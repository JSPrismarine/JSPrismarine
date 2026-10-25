/**
 * Flattens a Java-shaped command tree into the flat overload list Bedrock's
 * `AvailableCommandsPacket` carries.
 *
 * Bedrock's tree is a list of overloads per command with no redirects, so
 * Java's graph has to become a cartesian expansion. Three shapes do not
 * survive the trip, and each produces a note rather than a silent drop:
 *
 * - A redirect back to a node already on the path is a cycle, which no finite
 *   overload list can hold. Bedrock's answer is the chained-subcommand table,
 *   so the cycle becomes one trailing chained parameter and the overload is
 *   marked `isChaining`. That is exactly how Mojang's own metadata spells
 *   `/execute`: every subcommand keyword is a one-value hard enum and the tail
 *   is `EXECUTECHAINEDOPTION_0`.
 * - A redirect to the dispatcher root means "any command follows", which
 *   Bedrock spells as one `CODEBUILDERARGS` parameter. Mojang writes
 *   `/execute run <command: CODEBUILDERARGS>` for the same reason.
 * - An argument whose type cannot name a Bedrock parameter type becomes a
 *   string, which the client will not validate or autocomplete.
 *
 * Fork nodes flatten normally. A Bedrock client can be shown
 * `/execute as @e run say hi`; what it cannot do is run the fan-out, which
 * happens server-side in `CommandDispatcher.execute`. The flattener still
 * notes every fork, because the note is what tells a caller that the overload
 * it is about to send has semantics the client does not share.
 *
 * The guard against a node that is its own child is Geyser's, which it added
 * to stop a stack overflow on a self-referential argument.
 */
import type { ArgumentCommandNode, LiteralCommandNode, RootCommandNode } from '@jsprismarine/brigadier';

import { describesBedrock } from './argumentTypes';
import type { BedrockParameterShape } from './parameterTypes';
import { STRING_FALLBACK } from './parameterTypes';
import type { CommandRegistry } from './tree';

/** Why the flattener wants the caller to know about a node. */
export type FlattenReason =
    /** The argument type does not say what it is on the wire. */
    | 'untyped-argument'
    /** The argument type says Bedrock's 26 types cannot express it. */
    | 'no-bedrock-type'
    /** A redirect back onto the current path became a chained subcommand. */
    | 'redirect-cycle'
    /** A redirect to the dispatcher root became one command-valued parameter. */
    | 'redirect-to-root'
    /** The node forks, and Bedrock has no fork. */
    | 'fork'
    /** The node is its own child, and the branch was cut. */
    | 'self-child'
    /** The expansion hit the overload cap and the rest of the branch was cut. */
    | 'overload-limit';

/** How much of the node survived. */
export type FlattenSeverity =
    /** The client is shown something weaker than the real shape. */
    | 'degraded'
    /** The client is not shown this branch at all. */
    | 'dropped';

/** One thing the flattener could not carry across unchanged. */
export interface FlattenNote {
    /** The root command the node belongs to. */
    readonly command: string;
    /** The node path, space separated, as a usage string spells it. */
    readonly path: string;
    readonly reason: FlattenReason;
    readonly severity: FlattenSeverity;
    readonly message: string;
}

/** One parameter of a flattened overload. */
export interface FlattenedParameter {
    readonly name: string;
    readonly shape: BedrockParameterShape;
    readonly optional: boolean;
}

/** One flattened overload: the parameters a client types, in order. */
export interface FlattenedOverload {
    readonly parameters: readonly FlattenedParameter[];
    /** True when the overload ends in a chained subcommand parameter. */
    readonly chaining: boolean;
}

/** One chained-subcommand table entry: a name and the keywords it covers. */
export interface ChainedSubcommandTable {
    readonly name: string;
    readonly values: readonly string[];
}

/** One command as Bedrock's packet wants it. */
export interface FlattenedCommand {
    readonly name: string;
    readonly description: string;
    readonly aliases: readonly string[];
    readonly permissionLevel: number;
    readonly flags: number;
    readonly overloads: readonly FlattenedOverload[];
    /** The chained-subcommand tables this command's overloads point at. */
    readonly chainedSubcommands: readonly ChainedSubcommandTable[];
}

/** A flattened tree and everything the flattening cost. */
export interface FlattenResult {
    readonly commands: readonly FlattenedCommand[];
    /** Every node the flattener could not carry across unchanged. */
    readonly notes: readonly FlattenNote[];
}

/** How to flatten. */
export interface FlattenOptions<S> {
    /**
     * Filter the tree the way Java does, by `CommandNode.canUse`, so a player
     * is only shown the commands they may run. Omit to flatten the whole tree.
     */
    readonly source?: S;
    /**
     * The most overloads one command may produce before the expansion is cut
     * and noted. Mojang's widest command has 18.
     */
    readonly overloadLimit?: number;
}

const DEFAULT_OVERLOAD_LIMIT = 256;

/**
 * The port's abstract node type. Its index does not re-export `CommandNode`,
 * and naming the class through a deep import would give the declaration
 * emitter a second copy of a class with private fields, so the type is
 * derived from what a node's children iterate as.
 */
type CommandNode<S> = ReturnType<RootCommandNode<S>['getChildren']> extends Iterable<infer N> ? N : never;

interface Tail {
    readonly parameters: FlattenedParameter[];
    readonly chaining: boolean;
}

const isLiteral = <S>(node: CommandNode<S>): node is LiteralCommandNode<S> => node.getNodeType() === 'literal';
const isArgument = <S>(node: CommandNode<S>): node is ArgumentCommandNode<S, unknown> =>
    node.getNodeType() === 'argument';

// A node built without `.executes()` carries `undefined` rather than `null`,
// and one built without `.redirect()` carries `null`, so both are checked.
const isExecutable = <S>(node: CommandNode<S>): boolean => (node.getCommand() ?? null) !== null;
const redirectOf = <S>(node: CommandNode<S>): CommandNode<S> | null => node.getRedirect() ?? null;

/**
 * What Mojang appends to a command's name for its chained-subcommand table.
 * `/execute`'s is `EXECUTECHAINEDOPTION_0`.
 */
const CHAINED_SUBCOMMAND_SUFFIX = 'CHAINEDOPTION_';

/** Mojang's spelling for a one-keyword subcommand enum, `OPTION_AS` and friends. */
const literalEnumName = (names: readonly string[]): string =>
    `OPTION_${names
        .join('_')
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')}`;

class Flattener<S> {
    public readonly notes: FlattenNote[] = [];

    private readonly chainedTables = new Map<string, ChainedSubcommandTable>();
    private command = '';
    private truncated = false;

    public constructor(
        private readonly root: CommandNode<S>,
        private readonly options: FlattenOptions<S>
    ) {}

    /** Flattens one root literal into its overloads and the tables they use. */
    public flattenCommand(node: CommandNode<S>): {
        overloads: FlattenedOverload[];
        chainedSubcommands: ChainedSubcommandTable[];
    } {
        this.command = node.getName();
        this.chainedTables.clear();
        this.truncated = false;

        const tails = this.continuationsOf(node, new Set([node]), [node.getName()]);
        const limit = this.options.overloadLimit ?? DEFAULT_OVERLOAD_LIMIT;
        const kept = tails.slice(0, limit);
        if (tails.length > limit) this.cut(node.getName(), tails.length, limit);

        return {
            overloads: kept.map((tail) => ({ parameters: tail.parameters, chaining: tail.chaining })),
            chainedSubcommands: [...this.chainedTables.values()]
        };
    }

    private note(path: readonly string[], reason: FlattenReason, severity: FlattenSeverity, message: string): void {
        this.notes.push({ command: this.command, path: path.join(' '), reason, severity, message });
    }

    private cut(path: string, produced: number, limit: number): void {
        if (this.truncated) return;
        this.truncated = true;
        this.note(
            [path],
            'overload-limit',
            'dropped',
            `The expansion produced ${produced} overloads and was cut at ${limit}.`
        );
    }

    private usable(node: CommandNode<S>): boolean {
        return this.options.source === undefined || node.canUse(this.options.source);
    }

    /** The overload tails that continue after `node`, excluding its own parameter. */
    private continuationsOf(node: CommandNode<S>, visited: Set<CommandNode<S>>, path: string[]): Tail[] {
        if (node.isFork()) {
            this.note(
                path,
                'fork',
                'degraded',
                'The node forks, which the client cannot do. The fan-out happens server-side.'
            );
        }

        const redirect = redirectOf(node);
        if (redirect !== null) return this.followRedirect(node, redirect, visited, path);

        const tails: Tail[] = [];
        if (isExecutable(node)) tails.push({ parameters: [], chaining: false });
        tails.push(...this.childTails(node, visited, path));
        return tails;
    }

    private followRedirect(
        node: CommandNode<S>,
        redirect: CommandNode<S>,
        visited: Set<CommandNode<S>>,
        path: string[]
    ): Tail[] {
        if (redirect === this.root) {
            this.note(
                path,
                'redirect-to-root',
                'degraded',
                'A redirect to the command root became one command-valued parameter; the client ' +
                    'cannot autocomplete the command that follows.'
            );
            return [
                {
                    parameters: [
                        { name: 'command', shape: { kind: 'basic', type: 'CODEBUILDERARGS' }, optional: false }
                    ],
                    chaining: false
                }
            ];
        }

        if (!visited.has(redirect)) {
            return this.childTails(redirect, new Set([...visited, redirect]), path);
        }

        const values = [...redirect.getChildren()].filter(isLiteral).map((child) => child.getName());
        const table = this.chainedTable(values);
        this.note(
            path,
            'redirect-cycle',
            'degraded',
            `A redirect back to '${redirect.getName()}' is a cycle no overload list can hold. It ` +
                `became the chained subcommand '${table.name}' over ${values.length} keywords.`
        );
        return [
            {
                parameters: [
                    {
                        name: 'chainedCommand',
                        shape: { kind: 'chained', name: table.name },
                        // Java's `execute if entity @e` runs on its own, so the
                        // continuation is optional exactly when the node executes.
                        optional: isExecutable(node)
                    }
                ],
                chaining: true
            }
        ];
    }

    private chainedTable(values: readonly string[]): ChainedSubcommandTable {
        const existing = [...this.chainedTables.values()].find(
            (candidate) => candidate.values.join('\u0000') === values.join('\u0000')
        );
        if (existing !== undefined) return existing;
        // Mojang names `/execute`'s table `EXECUTECHAINEDOPTION_0`, so the
        // name is the command's, upper-cased, plus the table's index. Two
        // commands with cycles then cannot collide in the packet's one table.
        const name = `${this.command.toUpperCase()}${CHAINED_SUBCOMMAND_SUFFIX}${this.chainedTables.size}`;
        const table = { name, values };
        this.chainedTables.set(name, table);
        return table;
    }

    /** The overload tails of `node`'s children, each starting with the child's own parameter. */
    private childTails(node: CommandNode<S>, visited: Set<CommandNode<S>>, path: string[]): Tail[] {
        const tails: Tail[] = [];
        const literalGroups = new Map<string, { names: string[]; tails: Tail[] }>();

        for (const child of node.getChildren()) {
            if (child === node) {
                this.note(
                    [...path, child.getName()],
                    'self-child',
                    'dropped',
                    'The node is its own child, so the branch was cut.'
                );
                continue;
            }
            if (!this.usable(child)) continue;

            const childPath = [...path, child.getName()];
            const childVisited = new Set([...visited, child]);

            if (isLiteral(child)) {
                const continuation = this.continuationsOf(child, childVisited, childPath);
                // Sibling literals whose continuations are identical collapse
                // into one enum, which is how `if` and `unless` become
                // `OPTION_IF_UNLESS`.
                const signature = JSON.stringify(continuation);
                const group = literalGroups.get(signature);
                if (group === undefined)
                    literalGroups.set(signature, { names: [child.getName()], tails: continuation });
                else group.names.push(child.getName());
                continue;
            }

            if (!isArgument(child)) continue;

            const parameter = this.parameterOf(child, childPath);
            for (const tail of this.continuationsOf(child, childVisited, childPath)) {
                tails.push({ parameters: [parameter, ...tail.parameters], chaining: tail.chaining });
            }
        }

        for (const group of literalGroups.values()) {
            const parameter: FlattenedParameter = {
                name: group.names.join('|'),
                shape: { kind: 'enum', name: literalEnumName(group.names), values: group.names },
                optional: false
            };
            for (const tail of group.tails) {
                tails.push({ parameters: [parameter, ...tail.parameters], chaining: tail.chaining });
            }
        }

        return tails;
    }

    private parameterOf(node: ArgumentCommandNode<S, unknown>, path: string[]): FlattenedParameter {
        const type = node.getType();
        if (!describesBedrock(type)) {
            this.note(
                path,
                'untyped-argument',
                'degraded',
                `The argument type of '${node.getName()}' does not describe itself to a Bedrock ` +
                    'client, so it is sent as a string.'
            );
            return { name: node.getName(), shape: STRING_FALLBACK, optional: false };
        }

        const shape = type.describeBedrock();
        if (shape === undefined) {
            this.note(
                path,
                'no-bedrock-type',
                'degraded',
                `${type.bedrockGap ?? `Bedrock cannot express '${node.getName()}'`}, so it is sent as a string.`
            );
            return { name: node.getName(), shape: STRING_FALLBACK, optional: false };
        }

        return { name: node.getName(), shape, optional: false };
    }
}

/**
 * Flattens every command in a registry into Bedrock's overload shape.
 *
 * @param registry - The tree to flatten. Aliases fold into their owner's alias
 *   list rather than becoming commands of their own.
 * @returns The flattened commands and one note per node that could not be
 *   carried across unchanged.
 */
export const flattenCommandTree = <S>(registry: CommandRegistry<S>, options: FlattenOptions<S> = {}): FlattenResult => {
    const root = registry.getRoot();
    const flattener = new Flattener(root, options);
    const commands: FlattenedCommand[] = [];

    for (const child of root.getChildren()) {
        if (child.getNodeType() !== 'literal') continue;
        const metadata = registry.getMetadata(child.getName());
        // An alias node redirects to its owner and is listed in the owner's
        // alias enum, not as a command of its own.
        if (metadata === undefined) continue;
        if (options.source !== undefined && !child.canUse(options.source)) continue;

        const { overloads, chainedSubcommands } = flattener.flattenCommand(child);
        commands.push({
            name: child.getName(),
            description: metadata.description,
            aliases: metadata.aliases,
            permissionLevel: metadata.permissionLevel,
            flags: metadata.flags,
            overloads,
            chainedSubcommands
        });
    }

    return { commands, notes: flattener.notes };
};
