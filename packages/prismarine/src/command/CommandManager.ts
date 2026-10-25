import type { RootCommandNode } from '@jsprismarine/brigadier';
import { ArgumentCommandNode, CommandDispatcher, CommandSyntaxException } from '@jsprismarine/brigadier';
import type { CommandHost, CommandRegistry, CommandSource, FlattenedCommand } from '@jsprismarine/commands';
import { createCommandSource, flattenCommandTree } from '@jsprismarine/commands';
import {
    CommandRegisterClassMalformedOrMissingError,
    CommandUnknownCommandError,
    Error,
    GenericNamespaceInvalidError
} from '@jsprismarine/errors';
import { TICK_FUNCTION_TAG } from '@jsprismarine/mcfunction';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type { Command, Entity, Server, Service } from '../';
import { Chat } from '../chat/Chat';
import { collectAsyncCommands, deferCommandWork } from './Command';
// Imported straight from its module rather than through the barrel: `index.ts` exports
// `./world/` before `Player`, so reaching for it via '../' lands in a half-initialized
// module and the binding is not a constructor yet by the time `instanceof` runs.
import Player from '../Player';
import CommandRegisterEvent from '../events/command/CommandRegisterEvent';
import { CommandEnum } from '../network/type/CommandEnum';
import CommandParameter, { CommandParameterFlags } from '../network/type/CommandParameter';
import Timer from '../utils/Timer';
import type { CommandArgumentType } from './CommandArguments';
import { CommandArgument, isCommandArgument } from './CommandArguments';
import type { CommandExecutor } from './CommandExecutor';
import { isCommandExecutor } from './CommandExecutor';
import * as Commands from './Commands';
import type { FunctionContent } from './function';
import { FunctionRuntime, functionContentOf, loadServerFunctions } from './function';
import { dimensionIdOf, entityRefOf } from './host/support';
import { serverCommandHost } from './host/serverCommandHost';
import { UNWIRED_COMMANDS, buildVanillaCommands } from './vanillaCommands';

/**
 * A node of the registered command tree. Brigadier does not export `CommandNode`, so the type
 * is read off the root node's API.
 */
export type CommandTreeNode = NonNullable<ReturnType<RootCommandNode<CommandExecutor>['getChild']>>;

/**
 * A registered command: its name, its node, and each overload's arguments in input order. A
 * command that runs without arguments has an empty overload for that form.
 */
export type CommandListEntry = [name: string, node: CommandTreeNode, overloads: CommandArgumentType[][]];

/** A literal encoded as a one-value hard enum for the Bedrock command packet. */
class LiteralCommandArgument extends CommandArgument {
    public constructor(private readonly literal: string) {
        super();
    }

    public override getReadableType(): string {
        return this.literal;
    }

    public override getParameters(): Set<CommandParameter> {
        const literalEnum = new CommandEnum();
        literalEnum.name = `Literal:${this.literal}`;
        literalEnum.values = [this.literal];

        return new Set([
            new CommandParameter({
                paramName: this.literal,
                enum: literalEnum,
                flags: CommandParameterFlags.FORCE_COLLAPSE_ENUM
            })
        ]);
    }
}

/**
 * The permission node a vanilla command is gated by.
 *
 * The command layer carries a `CommandPermissionLevel`; this server gates on
 * named nodes, and the names are the ones the legacy command classes used, so
 * a `permissions.json` that granted `minecraft.command.me` still grants it.
 */
export const vanillaPermissionOf = (name: string): string => `minecraft.command.${name}`;

export class CommandManager implements Service {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<CommandExecutor>;

    /** What `@jsprismarine/commands` calls into - see {@link import('./host').serverCommandHost}. */
    private readonly host: CommandHost;

    /**
     * The vanilla command set, as a Java-shaped Brigadier tree.
     *
     * A second registry beside {@link CommandManager.dispatcher} rather than a
     * replacement for it: the two dispatch different source types, and the
     * `jsprismarine:` commands and the two vanilla ones the package does not
     * implement still run on the old one. A command name belongs to exactly
     * one of them, which is what {@link CommandManager.vanillaName} decides.
     */
    private readonly vanilla: CommandRegistry<CommandSource>;

    /**
     * The mcfunction runtime, built on first use.
     *
     * Lazily rather than in the constructor because the functions come from
     * the pack stack and the manager is constructed before the content build
     * runs. {@link CommandManager.setFunctionContent} drops it, so a content
     * reload drops the compiled functions with the packs they came from.
     */
    private functions: FunctionRuntime | undefined;

    /** A function source other than the server's content; see {@link CommandManager.setFunctionContent}. */
    private functionContent: FunctionContent | undefined;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher<CommandExecutor>();
        this.host = serverCommandHost(server);
        this.vanilla = buildVanillaCommands();
    }

    /**
     * The mcfunction runtime this server's `/function` and `/schedule` run
     * through.
     *
     * @returns {FunctionRuntime} The runtime, holding whatever functions the
     * loaded datapacks declared - which is none when `content-packs` is off.
     */
    public getFunctionRuntime(): FunctionRuntime {
        this.functions ??= new FunctionRuntime({
            loaded: loadServerFunctions(this.functionContent ?? functionContentOf(this.server.getContent())),
            dispatch: (commandLine, source) => this.runFunctionLine(commandLine, source),
            report: (diagnostic) => {
                const where = diagnostic.functionId
                    ? ` (${diagnostic.functionId}${diagnostic.line === undefined ? '' : `:${diagnostic.line}`})`
                    : '';
                const message = `${diagnostic.message}${where}`;
                if (diagnostic.severity === 'error') this.server.getLogger().warn(`§cfunction:§r ${message}`);
                else this.server.getLogger().debug(message, 'CommandManager/functions');
            }
        });
        return this.functions;
    }

    /**
     * Replaces the functions this server runs and drops the compiled ones.
     *
     * @param {FunctionContent} [content] - Where to compile functions from.
     * Undefined goes back to the server's own content, which is what a reload
     * wants; a caller that loaded a datapack itself passes its registries.
     */
    public setFunctionContent(content?: FunctionContent): void {
        this.functionContent = content;
        this.functions = undefined;
    }

    /**
     * Runs one line of a function through the vanilla dispatcher.
     *
     * No `collectAsyncCommands` here: a function line is dispatched from
     * inside a command body, which is already inside the collection
     * `dispatchCommand` opened, so the work a host verb parks reaches that
     * same queue and is awaited with the rest of the line that called the
     * function. {@link CommandManager.tickFunctions} is the one entry point
     * that opens its own.
     */
    private runFunctionLine(commandLine: string, source: CommandSource): { result?: number; forks?: number } {
        const results = this.vanilla.getDispatcher().execute(commandLine, source);
        if (!Array.isArray(results)) return {};

        const result = results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
        // A forked `execute as @e` reports one result per context, which is
        // exactly what `maxCommandForks` counts.
        return { result, forks: results.length };
    }

    /**
     * Runs `#minecraft:tick` and whatever `/schedule` put on this tick.
     *
     * Called once per server tick from the tick loop. Nothing here is awaited
     * by a sender, so the work the lines park is collected and awaited here
     * instead.
     *
     * @returns {Promise<number>} How many command lines ran.
     */
    public async tickFunctions(): Promise<number> {
        const runtime = this.getFunctionRuntime();
        if (runtime.queued === 0 && !runtime.has(`#${TICK_FUNCTION_TAG}`)) return 0;

        let commands = 0;
        const started = collectAsyncCommands(() => {
            commands = runtime.tick(this.internalSource());
        });
        await Promise.all(started);
        return commands;
    }

    /**
     * Runs `#minecraft:load`, which a server does once after its packs load.
     *
     * @returns {Promise<number>} How many command lines ran.
     */
    public async runLoadFunctions(): Promise<number> {
        const runtime = this.getFunctionRuntime();
        let commands = 0;
        const started = collectAsyncCommands(() => {
            commands = runtime.runLoad(this.internalSource());
        });
        await Promise.all(started);
        return commands;
    }

    /**
     * The source `#minecraft:tick` and `#minecraft:load` run with: the server
     * itself, in the default world, with every permission and nobody to talk
     * to. Java's is the same stack the console runs with, silenced.
     */
    private internalSource(): CommandSource {
        return createCommandSource({
            host: this.host,
            dimension: dimensionIdOf(this.server.getWorldManager().getDefaultWorld()),
            permissionLevel: CommandPermissionLevel.INTERNAL,
            silent: true,
            onError: (message) => this.server.getLogger().warn(`§cfunction:§r ${message}`)
        });
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();

        this.server
            .getLogger()
            .verbose(
                `Registered §b${this.vanilla.getNames().length}§r vanilla command(s); ` +
                    `§e${Object.keys(UNWIRED_COMMANDS).length}§r need a subsystem this server does not have`
            );

        const commands = Object.values(Commands);

        // Register jsprismarine commands
        await Promise.all(
            commands.map(async (Command) => {
                const command = new Command();

                const event = new CommandRegisterEvent(command);
                await this.server.emit('commandRegister', event);
                if (event.isCanceled()) return;

                try {
                    await this.registerCommand(command);
                } catch (error: unknown) {
                    this.server.getLogger().error(error);
                    this.server.getLogger().warn(`Failed to register command ${command.id}`);
                }
            })
        );

        this.server
            .getLogger()
            .verbose(`Registered §b${this.commands.size}§r commands(s) (took §e${timer.stop()} ms§r)!`);
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.commands.clear();
        // TODO: clear commands in dispatcher
    }

    /**
     * Register a command into command manager by class.
     * @param {Command} [command] - The command class to register
     */
    public async registerCommand(command?: Command): Promise<void> {
        if (!command || !command.id) throw new CommandRegisterClassMalformedOrMissingError();
        if (command.id.split(':').length !== 2) throw new GenericNamespaceInvalidError();

        await command.register(this.dispatcher);
        this.commands.set(command.id, command);

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .map(async (player) => player.getNetworkSession().sendAvailableCommands())
        );

        this.server.getLogger().debug(`Command with id §b${command.id}§r registered`);
    }

    /**
     * Get a registered command by ID.
     * @remarks This is case-insensitive, works with or without namespace, and also with aliases.
     * @param {string} id - The command ID.
     * @returns {Command} The command if found, otherwise undefined.
     */
    public getCommand(id: string): Command {
        const command = Array.from(this.commands.values()).find(
            (command) =>
                // Check if it matches ID without namespace.
                command.name === id ||
                // Check if it's an alias.
                command.aliases?.includes(id) ||
                // Last check if it's the whole ID (this is uncommon so,
                //  it's last to avoid the most checks).
                command.id === id
        );

        if (!command) throw new CommandUnknownCommandError();
        return command;
    }

    /**
     * Get all enabled commands.
     */
    public getCommands(): Map<string, Command> {
        return this.commands;
    }

    /**
     * Get a list of all registered commands with the overloads the command tree spells out.
     *
     * @remarks
     * This is EXCLUDING legacy commands.
     */
    public getCommandsList(): CommandListEntry[] {
        const argumentFor = (node: CommandTreeNode): CommandArgumentType =>
            node instanceof ArgumentCommandNode ? node.getType() : new LiteralCommandArgument(node.getName());

        const flatten = (
            node: CommandTreeNode,
            path: CommandArgumentType[],
            ancestors: ReadonlySet<CommandTreeNode>
        ): CommandArgumentType[][] => {
            if (ancestors.has(node)) return [];

            const nodePath = [...path, argumentFor(node)];
            const descendants = new Set(Array.from(node.getChildren()));
            const redirect = node.getRedirect();
            if (redirect) {
                for (const child of redirect.getChildren()) descendants.add(child);
            }

            const nextAncestors = new Set(ancestors).add(node);
            const overloads = node.getCommand() ? [nodePath] : [];
            for (const child of descendants) overloads.push(...flatten(child, nodePath, nextAncestors));

            return overloads;
        };

        const res = Array.from(this.dispatcher.getRoot().getChildren()).map((command): CommandListEntry => {
            // One entry per command, whatever the tree's shape. This used to return one entry
            // per top-level argument node, so `/tp` reached the client four times over and the
            // client, which keys commands by name, kept whichever copy it read last.
            const overloads: CommandArgumentType[][] = command.getCommand() ? [[]] : [];
            const descendants = new Set(Array.from(command.getChildren()));
            const redirect = command.getRedirect();
            if (redirect) {
                for (const child of redirect.getChildren()) descendants.add(child);
            }
            for (const node of descendants) {
                overloads.push(...flatten(node, [], new Set([command])));
            }

            return [command.getName(), command, overloads];
        });

        res.toString = () => {
            return `${this.getCommandsList()
                .map((item) => {
                    if (!item[2].length) return `/${item[0]}`;
                    return item[2]
                        .map((entries) =>
                            [
                                `/${item[0]}`,
                                ...entries.map((argument) =>
                                    isCommandArgument(argument) ? argument.getReadableType() : argument.constructor.name
                                )
                            ].join(' ')
                        )
                        .join(`\n`);
                })
                .join('\n')}`;
        };
        return res;
    }

    /**
     * Get dispatcher
     */
    public getDispatcher(): CommandDispatcher<CommandExecutor> {
        return this.dispatcher;
    }

    /** The vanilla command set, for the session that has to advertise it. */
    public getVanillaCommands(): CommandRegistry<CommandSource> {
        return this.vanilla;
    }

    /**
     * The vanilla command set flattened into Bedrock's overload shape.
     *
     * Flattened per call rather than cached: a command's tree never changes,
     * but the list is built once per recipient and the cost is a walk of fifty
     * trees, which is less than the packet it goes out in.
     * @returns {FlattenedCommand[]} One entry per command, aliases folded in.
     */
    public getVanillaCommandList(): readonly FlattenedCommand[] {
        return flattenCommandTree(this.vanilla).commands;
    }

    /**
     * The command a name or alias belongs to in the vanilla set.
     *
     * @param {string} name - The first word of a command line, without the slash.
     * @returns {string | undefined} The owning command's name, or undefined
     * when the vanilla set does not hold it.
     */
    public vanillaName(name: string): string | undefined {
        const lower = name.toLowerCase();
        if (this.vanilla.getMetadata(lower) !== undefined) return lower;
        return this.vanilla.getAliasOwner(lower);
    }

    /**
     * The usage lines `/help` prints.
     *
     * @param {string} [command] - One command's name, or undefined for the whole list.
     * @returns {string[]} One line per command, or per overload for a named command.
     */
    public usageLines(command?: string): readonly string[] {
        const flattened = this.getVanillaCommandList();
        if (command === undefined) {
            return flattened.map((entry) => `/${entry.name} - ${entry.description}`);
        }

        const owner = this.vanillaName(command);
        const entry = flattened.find((candidate) => candidate.name === owner);
        if (entry === undefined) return [];

        return entry.overloads.map((overload) =>
            [`/${entry.name}`, ...overload.parameters.map((parameter) => `<${parameter.name}>`)].join(' ')
        );
    }

    /**
     * Builds the `CommandSourceStack` a vanilla command runs with.
     *
     * The console is level 5, an operator level 4 and everyone else level 0,
     * which is the only mapping this server's named permission nodes allow:
     * `defaultOperatorPermissions` is `*`, so an operator may run everything
     * and a player may run what `permissions.json` names. The level is what
     * the client is told, and the node is what the dispatch checks.
     */
    private vanillaSource(sender: CommandExecutor, target: CommandExecutor): CommandSource {
        const entity = target instanceof Player ? entityRefOf(target) : undefined;
        const operator = sender instanceof Player ? sender.isOp() : true;
        const world = sender instanceof Player ? sender.getWorld() : this.server.getWorldManager().getDefaultWorld();

        return createCommandSource({
            host: this.host,
            ...(entity === undefined ? {} : { entity }),
            permissionLevel:
                sender instanceof Player
                    ? operator
                        ? CommandPermissionLevel.OWNER
                        : CommandPermissionLevel.ANY
                    : CommandPermissionLevel.INTERNAL,
            // `sendCommandFeedback` is Java's switch for exactly this: the
            // success message, never the failure.
            silent: world.getGameRuleManager().getGameRule('sendCommandFeedback')?.[0] !== true,
            dialect: sender instanceof Player ? 'bedrock' : 'java',
            onFeedback: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(message))),
            onError: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(`§c${message}`)))
        });
    }

    /**
     * Runs one vanilla command.
     *
     * @returns True when the command ran, false when the sender was refused or
     * the command reported a failure; either way the sender has been told.
     */
    private async dispatchVanilla(
        sender: CommandExecutor,
        target: CommandExecutor,
        name: string,
        input: string
    ): Promise<boolean> {
        const metadata = this.vanilla.getMetadata(name)!;

        if (sender instanceof Player) {
            if (!this.server.getPermissionManager().can(sender).execute(vanillaPermissionOf(name))) {
                await sender.sendMessage(
                    "§cI'm sorry, but you do not have permission to perform this command. " +
                        'Please contact the server administrators if you believe that this is in error.'
                );
                return false;
            }
        }

        const source = this.vanillaSource(sender, target);
        if (metadata.permissionLevel > source.permissionLevel) {
            await sender.sendMessage('§cThat command needs a higher permission level');
            return false;
        }

        // The dispatcher is synchronous and the host verbs park their delivery
        // on the same queue the legacy bodies use, so everything one command
        // line started is awaited here before the call returns.
        let results: unknown = [];
        const started = collectAsyncCommands(() => {
            results = this.vanilla.getDispatcher().execute(input, source);
        });
        await Promise.all(started);

        // The port's `execute` answers with one result per executed context, so
        // a forked `execute as @e run ...` reports the whole fan-out's total,
        // which is what upstream Brigadier's `int` return adds up to.
        const total = Array.isArray(results)
            ? results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
            : 0;
        return total > 0;
    }

    /**
     * Dispatches a command and executes it.
     *
     * @param sender - the player/console who executed the command
     * @param target - the Player/entity/console who should execute the command
     * @param input - the command input including arguments
     * @returns True when the command ran. False when the target cannot run commands, the
     * sender lacks the permission, the command is unknown, or it threw; in each of those
     * cases the sender has been sent the reason.
     */
    public async dispatchCommand(
        sender: CommandExecutor,
        target: CommandExecutor | Entity,
        input = ''
    ): Promise<boolean> {
        try {
            // Anything else an `@e` selector can match has no way to be answered.
            if (!isCommandExecutor(target)) {
                await sender.sendMessage(`§c${target.getName()} cannot execute commands`);
                return false;
            }
            if (input.startsWith('/')) input = input.slice(1);
            input = input.trim();

            // The vanilla set first. A name belongs to exactly one of the two
            // trees, and the vanilla one owns every name it holds - which is
            // what retires a legacy class rather than shadowing it.
            const typed = input.split(' ')[0] ?? '';
            const vanilla = this.vanillaName(typed);
            if (vanilla !== undefined) {
                if (sender instanceof Player) {
                    this.server
                        .getLogger()
                        .debug(
                            `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${vanilla})`,
                            'CommandManager/dispatchCommand'
                        );
                }

                return await this.dispatchVanilla(sender, target, vanilla, input);
            }

            const parsed = this.dispatcher.parse(input.trim(), target);
            const id = parsed.getReader().getString().split(' ')[0]!;

            // Get command from parsed string.
            const command = this.getCommand(id);

            // Permissions gate players only. The console is the process operator: it is
            // trusted by the fact that it exists, not by a permission node - which is what
            // the `isConsole()` bypass inside the permission manager used to say.
            if (sender instanceof Player) {
                this.server
                    .getLogger()
                    .debug(
                        `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${id})`,
                        'CommandManager/dispatchCommand'
                    );

                if (!this.server.getPermissionManager().can(sender).execute(command.permission)) {
                    await sender.sendMessage(
                        "§cI'm sorry, but you do not have permission to perform this command. " +
                            'Please contact the server administrators if you believe that this is in error.'
                    );
                    return false;
                }
            }

            // Handle aliases and IDs.
            if (command.name !== id) {
                return this.dispatchCommand(sender, target, input.replace(id, command.name));
            }

            // The dispatcher is synchronous and a command body returns a result code, so the
            // work a body awaits is collected here and awaited before the feedback goes out.
            // See `asyncCommand` for why the bodies cannot return their promises directly.
            const res = await Promise.all(collectAsyncCommands(() => this.dispatcher.execute(parsed)));

            // `sendCommandFeedback` is a per-world gamerule, so it is read from the world the
            // sender is standing in. The console stands in none; the default world answers
            // for it.
            const world =
                sender instanceof Player ? sender.getWorld() : this.server.getWorldManager().getDefaultWorld();
            // The stored rule is a `[value, editable]` pair, so the value is
            // what decides. Read as the pair itself, the check was a non-empty
            // array and the gamerule never suppressed anything.
            const feedback = world.getGameRuleManager().getGameRule('sendCommandFeedback')?.[0];

            // Make sure we don't send feedback if sendCommandFeedback is set to false
            if (!feedback) return true;

            await Promise.all(
                res.map(async (feedback) => {
                    const chat = new Chat({
                        sender: this.server.getConsoleSender(),
                        message: `§o§7[${target.getName()}: ${feedback ?? `issued server command: /${input}`}]§r`,
                        channel: '*.ops'
                    });

                    // TODO: should this be broadcasted to the executer?
                    await this.server.getChatManager().send(chat);
                })
            );

            return true;
        } catch (error: unknown) {
            switch (true) {
                case error instanceof CommandSyntaxException:
                    await sender.sendMessage(`§c${error.getMessage()}`);
                    return false;
                case error instanceof CommandUnknownCommandError:
                    await sender.sendMessage(`§cUnknown command. Type "/help" for help.`);
                    return false;
                case error instanceof Error:
                    await sender.sendMessage(`§c${error.message}`);
                    return false;
                default:
                    this.server.getLogger().error(error);
                    break;
            }

            await sender.sendMessage(`§c${error}`);
            this.server
                .getLogger()
                .debug(
                    `Player ${target.getFormattedUsername()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server.getLogger().error(error);
            return false;
        }
    }
}
