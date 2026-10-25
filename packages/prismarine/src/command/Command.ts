import type { ArgumentType, CommandContext, CommandDispatcher } from '@jsprismarine/brigadier';
import {
    ArgumentCommandNode,
    argument as brigadierArgument,
    literal as brigadierLiteral
} from '@jsprismarine/brigadier';
import type { CommandExecutor } from './CommandExecutor';

/**
 * The feedback a command body produces, which {@link CommandManager.dispatchCommand} broadcasts
 * to the operator channel. A body that answers the sender itself produces none.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: undefined would reject an async body that returns nothing, which most of these bodies do
export type CommandFeedback = string | void;

/**
 * The result a command that ran reports.
 *
 * Brigadier's result is a count, where 0 means the command did nothing and a positive number is
 * what `execute store result` captures. None of this server's commands count anything yet, so a
 * body that ran reports 1.
 */
const COMMAND_RAN = 1;

/** The bodies {@link collectAsyncCommands} is currently collecting. */
const running: Promise<CommandFeedback>[] = [];

/**
 * Wraps a command body that has work to await as a Brigadier command.
 *
 * `CommandDispatcher.execute` is synchronous and upstream Brigadier's `Command.run` returns an
 * `int`, so a body cannot hand the dispatcher a promise: the dispatcher would push it into its
 * result list and give it to the `ResultConsumer` unresolved. Almost every command here answers
 * the sender, touches a world or shuts the server down, so almost every body has to await
 * something.
 *
 * The body is started synchronously and its promise is parked on a queue, which
 * {@link collectAsyncCommands} hands back to `CommandManager.dispatchCommand`. The command is
 * awaited there, so nothing is fired and forgotten: a rejection still reaches the sender and the
 * feedback string a body returns is still broadcast.
 */
export const asyncCommand =
    (run: (context: CommandContext<CommandExecutor>) => Promise<CommandFeedback>) =>
    (context: CommandContext<CommandExecutor>): number => {
        deferCommandWork(run(context));
        return COMMAND_RAN;
    };

/**
 * Parks work a synchronous command body started, so the dispatch awaits it.
 *
 * The seam `@jsprismarine/commands` defines is synchronous - a host verb
 * answers how many blocks changed or whether the player exists - while nearly
 * every server API that carries the change out is asynchronous, because the
 * change goes out over the wire. A host verb therefore decides the answer
 * synchronously and hands the delivery here.
 *
 * It is the same queue {@link asyncCommand} uses and the same guarantee:
 * {@link collectAsyncCommands} hands the promises to
 * `CommandManager.dispatchCommand`, which awaits them before any feedback goes
 * out, so a rejection reaches the sender rather than becoming an unhandled
 * rejection.
 */
export const deferCommandWork = (work: Promise<CommandFeedback>): void => {
    running.push(work);
};

/**
 * Runs `execute` and returns the bodies {@link asyncCommand} started while it ran.
 *
 * One module-level queue is enough for any number of dispatchers. `CommandDispatcher.execute` is
 * synchronous and so is this, so the only thing that can reach the queue in between is a nested
 * dispatch from a body that has not awaited yet, which `/execute` does. That case parks the outer
 * queue rather than clearing it.
 *
 * @throws Whatever `execute` throws, after absorbing the rejections of the bodies it had already
 *   started, which nothing will await.
 */
export const collectAsyncCommands = (execute: () => void): Promise<CommandFeedback>[] => {
    const outer = running.splice(0);
    try {
        execute();
        return running.splice(0);
    } catch (error: unknown) {
        for (const pending of running.splice(0)) void pending.catch(() => {});
        throw error;
    } finally {
        running.push(...outer);
    }
};

/**
 * Starts a lowercase literal node whose callbacks receive the command source as a `CommandExecutor`.
 * Prefer this over brigadier's `literal`, which leaves the source untyped.
 * @throws {TypeError} If the name contains uppercase characters.
 */
export const literal = <const Name extends string>(name: Name & Lowercase<Name>) => {
    if (name !== name.toLowerCase()) throw new TypeError('Command literal names must be lowercase');

    return brigadierLiteral<CommandExecutor>(name);
};

/**
 * Starts an argument node whose callbacks receive the command source as a `CommandExecutor`.
 * Prefer this over brigadier's `argument`, which leaves the source untyped.
 */
export const argument = <T>(name: string, type: ArgumentType<T>) => brigadierArgument<CommandExecutor, T>(name, type);

export interface CommandProps {
    id: string;
    description?: string;
    permission?: string;
    aliases?: string[];
}

export class Command {
    /**
     * The command's id in a `[namespace]:[id]` format.
     */
    public id: string;

    public get name(): string {
        return this.id.split(':').at(-1)!;
    }

    /**
     * The command's description.
     */
    public description: string;

    /**
     * The command's permission.
     */
    public permission?: string;

    /**
     * The command's aliases.
     */
    public aliases?: string[];

    public constructor({ id = '', description = '', permission = '', aliases = [] }: CommandProps) {
        this.id = id;
        this.description = description;
        this.permission = permission;
        this.aliases = aliases;
    }

    /**
     * Register the command.
     */
    public async register(_dispatcher: CommandDispatcher<CommandExecutor>): Promise<void> {}

    public usage(dispatcher: CommandDispatcher<CommandExecutor>): string {
        // TODO: Improve this, it's not really accurate right now.
        return Array.from(dispatcher.findNode([this.name])?.getChildren() || [])
            .map((child) => {
                if (!(child instanceof ArgumentCommandNode)) return null;
                return child.getUsageText();
            })
            .filter(Boolean)
            .join(' ')
            .trim();
    }
}
