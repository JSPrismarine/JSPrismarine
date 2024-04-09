import type { ArgumentCommandNode } from '@jsprismarine/brigadier';
import { CommandDispatcher, CommandSyntaxException } from '@jsprismarine/brigadier';

import Chat from '../chat/Chat';
import type { Command } from './Command';
import type { CommandArgument } from './CommandArguments';
// import CommandNode from '@jsprismarine/brigadier/dist/lib/tree/CommandNode';
import CommandRegisterEvent from '../events/command/CommandRegisterEvents';
import type Entity from '../entity/Entity';
import type { Player } from '../';
import type Server from '../Server';
import Timer from '../utils/Timer';
import fs from 'node:fs';
import url from 'node:url';
import {
    GenericNamespaceInvalidError,
    CommandRegisterClassMalformedOrMissingError,
    CommandUnknownCommandError,
    Error
} from '@jsprismarine/errors';

export default class CommandManager {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<Player>;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher();
    }

    /**
     * OnEnable hook.
     */
    public async onEnable() {
        const timer = new Timer();

        // FIXME: `import.meta.url` isn't defined when using cjs.
        const fileType = import.meta.url.split('.').pop();
        const commands = Array.from(
            new Set(
                [
                    ...fs
                        .readdirSync(url.fileURLToPath(new URL('vanilla', import.meta.url)))
                        .map((a) => `/vanilla/${a}`),
                    ...fs
                        .readdirSync(url.fileURLToPath(new URL('jsprismarine', import.meta.url)))
                        .map((a) => `/jsprismarine/${a}`)
                ]
                    .filter((a) => !a.includes('.test.') && !a.includes('.d.ts'))
                    .filter((a) => a.endsWith(`.${fileType}`))
            )
        );

        // Register jsprismarine commands
        await Promise.all(
            commands.map(async (id: string) => {
                const Command = await import(`./${id}`);
                const command: Command = new (Command.default || Command)();

                const event = new CommandRegisterEvent(command);
                await this.server.getEventManager().emit('commandRegister', event);
                if (event.isCancelled()) return;

                try {
                    await this.registerClassCommand(command);
                } catch (error: unknown) {
                    this.server.getLogger()?.error(error);
                    this.server.getLogger()?.warn(`Failed to register command ${command.id}`);
                }
            })
        );

        this.server
            .getLogger()
            ?.verbose(
                `Registered §b${this.commands.size}§r commands(s) (took ${timer.stop()} ms)!`,
                'CommandManager/onEnable'
            );
    }

    /**
     * OnDisable hook.
     */
    public async onDisable() {
        this.commands.clear();
        // TODO: clear commands in dispatcher
    }

    /**
     * Register a command into command manager by class.
     */
    public async registerClassCommand(command: Command) {
        if (!command || !command.id) throw new CommandRegisterClassMalformedOrMissingError();
        if (command.id.split(':').length !== 2) throw new GenericNamespaceInvalidError();

        if (!command.register)
            this.server
                .getLogger()
                ?.warn(
                    `Command is missing "register" member. This is unsupported!`,
                    'CommandManager/registerClassCommand'
                );
        else await command.register(this.dispatcher);
        this.commands.set(command.id, command);

        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => player.getNetworkSession().sendAvailableCommands())
        );

        this.server
            .getLogger()
            ?.debug(`Command with id §b${command.id}§r registered`, 'CommandManager/registerClassCommand');
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
            .filter((a) => a);

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

            this.server
                .getLogger()
                ?.verbose(
                    `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${id})`,
                    'CommandManager/dispatchCommand'
                );

            // Get command from parsed string.
            const command = Array.from(this.commands.values()).find(
                (command) =>
                    // Check if it matches ID without namespace.
                    command.id.split(':').at(-1) === id ||
                    // Check if it's an alias.
                    command.aliases?.includes(id) ||
                    // Last check if it's the whole ID (this is uncommon so,
                    //  it's last to avoid the most checks).
                    command.id === id
            );

            if (!command) throw new CommandUnknownCommandError();

            if (!this.server.getPermissionManager().can(sender).execute(command.permission)) {
                await sender.sendMessage(
                    "§cI'm sorry, but you do not have permission to perform this command. " +
                        'Please contact the server administrators if you believe that this is in error.'
                );
                return;
            }

            let res: string[] = [];
            if (!command.register && command.execute) {
                // Legacy commands
                this.server
                    .getLogger()
                    ?.warn(`${id} is using the legacy command format`, 'CommandManager/dispatchCommand');
                res.push(
                    await command.execute(
                        sender as any,
                        parsed.getReader().getString().replace(`${id} `, '').split(' ')
                    )
                );
            } else {
                // Handle aliases and IDs.
                if (command.id.split(':').at(-1) !== id) {
                    await this.dispatchCommand(sender, target, input.replace(id, command.id.split(':')[1]!));
                    return;
                }

                res = await Promise.all(this.dispatcher.execute(parsed));
            }

            const feedback = (sender as any as Entity)
                .getWorld()
                .getGameruleManager()
                .getGamerule('sendCommandFeedback');

            // Make sure we don't send feedback if sendCommandFeedback is set to false
            if (feedback) {
                res.forEach(async (res: any) => {
                    const chat = new Chat(
                        this.server.getConsole(),
                        `§o§7[${target.getName()}: ${res ?? `issued server command: /${input}`}]§r`,
                        [],
                        false,
                        '*.ops'
                    );

                    // TODO: should this be broadcasted to the executer?
                    await this.server.getChatManager().send(chat);
                });
            } else {
                const chat = new Chat(
                    this.server.getConsole(),
                    `§o§7[${sender.getName()}: ${res.length > 0 ? res : `issued server command: /${input}`}]§r`,
                    [],
                    false,
                    '*.console'
                );

                await this.server.getChatManager().send(chat);
            }
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
                    this.server.getLogger()?.error(error, 'CommandManager/dispatchCommand');
                    break;
            }

            await sender.sendMessage(`§c${error}`);
            this.server
                .getLogger()
                ?.debug(
                    `Player ${target.getFormattedUsername()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server.getLogger()?.error(error, 'CommandManager/dispatchCommand');
        }
    }
}
