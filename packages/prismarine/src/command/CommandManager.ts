import type { RootCommandNode } from '@jsprismarine/brigadier';
import { ArgumentCommandNode, CommandDispatcher, CommandSyntaxException } from '@jsprismarine/brigadier';
import {
    CommandRegisterClassMalformedOrMissingError,
    CommandUnknownCommandError,
    Error,
    GenericNamespaceInvalidError
} from '@jsprismarine/errors';

import type { Command, Entity, Server, Service } from '../';
import { Chat } from '../chat/Chat';
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

export class CommandManager implements Service {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<CommandExecutor>;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher<CommandExecutor>();
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();

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

            let res: string[] = [];
            // Handle aliases and IDs.
            if (command.name !== id) {
                return this.dispatchCommand(sender, target, input.replace(id, command.name));
            }

            res = await Promise.all(this.dispatcher.execute(parsed));

            // `sendCommandFeedback` is a per-world gamerule, so it is read from the world the
            // sender is standing in. The console stands in none; the default world answers
            // for it.
            const world =
                sender instanceof Player ? sender.getWorld() : this.server.getWorldManager().getDefaultWorld();
            const feedback = world.getGameRuleManager().getGameRule('sendCommandFeedback');

            // Make sure we don't send feedback if sendCommandFeedback is set to false
            if (!feedback) return true;

            await Promise.all(
                res.map(async (res: any) => {
                    const chat = new Chat({
                        sender: this.server.getConsole()!,
                        message: `§o§7[${target.getName()}: ${res ?? `issued server command: /${input}`}]§r`,
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
