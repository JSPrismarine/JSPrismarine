import type { ArgumentCommandNode } from '@jsprismarine/brigadier';
import { CommandDispatcher, CommandSyntaxException } from '@jsprismarine/brigadier';
import {
    CommandRegisterClassMalformedOrMissingError,
    CommandUnknownCommandError,
    Error,
    GenericNamespaceInvalidError
} from '@jsprismarine/errors';

import type { Command, CommandArgument, Entity, Player, Server, Service } from '../';
import { Chat } from '../';
import CommandRegisterEvent from '../events/command/CommandRegisterEvent';
import Timer from '../utils/Timer';
import { Commands } from './';

export class CommandManager implements Service {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<Player>;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher();
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();

        const commands = Object.keys(Commands).map((key) => (Commands as any)[key] as typeof Command);

        // Register jsprismarine commands
        await Promise.all(
            commands.map(async (Command) => {
                const command: Command = new Command({} as any);

                const event = new CommandRegisterEvent(command);
                await this.server.emit('commandRegister', event);
                if (event.isCancelled()) return;

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

        if (!(command as any).register)
            this.server.getLogger().warn(`Command is missing "register" member. This is unsupported!`);
        else await command.register(this.dispatcher);
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
     * Get a list of all command variants.
     *
     * @remarks
     * This is EXCLUDING legacy commands.
     */
    public getCommandsList(): Array<[string, /* CommandNode<Player> */ any, CommandArgument[][]]> {
        const parseNode = (node: /* CommandNode<Player> */ any): any[] => {
            if (node.getChildrenCount() <= 0) {
                return [
                    {
                        item: (node as ArgumentCommandNode<any, any>).getType(),
                        children: []
                    }
                ];
            }

            const res = Array.from(node.getChildren())
                .map((node) => parseNode(node))
                .reverse();

            return [
                node.getCommand()
                    ? {
                          item: (node as ArgumentCommandNode<any, any>).getType(),
                          children: []
                      }
                    : undefined,
                ...res.map((children: any) => ({
                    item: (node as ArgumentCommandNode<any, any>).getType(),
                    children: [...children]
                }))
            ].filter((a) => a);
        };

        const traverse = (node: any, path: any[] = [], result: any[] = []) => {
            if (!node.children.length) result.push(path.concat(node.item));
            for (const child of node.children) traverse(child, path.concat(node.item), result);
            return result;
        };

        const res = Array.from(this.server.getCommandManager().getDispatcher().getRoot().getChildren())
            .flatMap((command) => {
                const branches: any[] = [];
                if (command.getCommand()) branches.push([]);

                Array.from(command.getChildren()).forEach((node) => {
                    const parsed = parseNode(node);
                    parsed.forEach((branch) => {
                        branches.push(traverse(branch));
                    });
                });

                return branches.map((branch) => [command.getName(), command, branch]);
            })
            .filter((a) => a as any);

        res.toString = () => {
            return `${this.getCommandsList()
                .map((item) => {
                    if (!item[2].length) return `/${item[0]}`;
                    return item[2]
                        .map(
                            (entries) =>
                                `/${item[0]} ${entries
                                    .flat(Number.POSITIVE_INFINITY)
                                    .map((argument: any) => argument.getReadableType?.() ?? argument.constructor.name)
                                    .join(' ')}`
                        )
                        .join(`\n`);
                })
                .join('\n')}`;
        };
        return res as any;
    }

    /**
     * Get dispatcher
     */
    public getDispatcher(): CommandDispatcher<Player> {
        return this.dispatcher;
    }

    /**
     * Dispatches a command and executes them.
     *
     * @param sender - the player/console who executed the command
     * @param target - the Player/entity/console who should execute the command
     * @param input - the command input including arguments
     */
    public async dispatchCommand(sender: Player, target: Entity | Player, input = '') {
        try {
            if (input.startsWith('/')) input = input.slice(1);

            const parsed = this.dispatcher.parse(input.trim(), target as Player);
            const id = parsed.getReader().getString().split(' ')[0]!;

            if (!sender.isConsole()) {
                this.server
                    .getLogger()
                    .debug(
                        `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${id})`,
                        'CommandManager/dispatchCommand'
                    );
            }

            // Get command from parsed string.
            const command = this.getCommand(id);

            // Validate permissions.
            if (!this.server.getPermissionManager().can(sender).execute(command.permission)) {
                await sender.sendMessage(
                    "§cI'm sorry, but you do not have permission to perform this command. " +
                        'Please contact the server administrators if you believe that this is in error.'
                );
                return;
            }

            let res: string[] = [];
            // Handle aliases and IDs.
            if (command.name !== id) {
                await this.dispatchCommand(sender, target, input.replace(id, command.name));
                return;
            }

            res = await Promise.all(this.dispatcher.execute(parsed));

            const feedback = (sender as any as Entity)
                .getWorld()
                .getGameruleManager()
                .getGamerule('sendCommandFeedback');

            // Make sure we don't send feedback if sendCommandFeedback is set to false
            if (!feedback) return;

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
        } catch (error: unknown) {
            switch (true) {
                case error instanceof CommandSyntaxException:
                    await sender.sendMessage(`§c${error.getMessage()}`);
                    return;
                case error instanceof CommandUnknownCommandError:
                    await sender.sendMessage(`§cUnknown command. Type "/help" for help.`);
                    return;
                case error instanceof Error:
                    await sender.sendMessage(`§c${error.message}`);
                    return;
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
        }
    }
}
