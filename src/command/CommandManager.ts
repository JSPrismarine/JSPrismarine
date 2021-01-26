import {
    argument,
    ArgumentCommandNode,
    CommandDispatcher
} from '@jsprismarine/brigadier';

import Chat from '../chat/Chat';
import Command from './Command';
import { CommandArgument } from './CommandArguments';
import CommandExecuter from './CommandExecuter';
import CommandNode from '@jsprismarine/brigadier/dist/lib/tree/CommandNode';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class CommandManager {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<CommandExecuter>;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher();
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        const time = Date.now();

        const commands = [
            ...fs.readdirSync(path.join(__dirname, 'vanilla')).map((a) => `/vanilla/${a}`),
            ...fs.readdirSync(path.join(__dirname, 'jsprismarine')).map((a) => `/jsprismarine/${a}`)
        ];

        // Register jsprismarine commands
        commands.forEach(async (id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts') || id.includes('.map')) return; // Exclude test files

            if (!this.server.getConfig().getEnableEval() && id.includes('EvalCommand')) return;

            const Command = require(`./${id}`);
            const command: Command = new (Command.default || Command)();

            try {
                if (command.api === 'rfc') {
                    await this.registerCommand(command, false);
                } else {
                    await this.registerClassCommand(command, this.server);
                }
            } catch (err) {
                this.server.getLogger().warn(`Failed to register command ${command.id}: ${err}`);
                this.server.getLogger().silly(err.stack);
            }
        });
        await this.sendAvailableCommands();

        this.server
            .getLogger()
            .debug(
                `Registered §b${commands.length}§r commands(s) (took ${Date.now() - time} ms)!`,
                'CommandManager/onEnable'
            );
    }

    /**
     * OnDisable hook
     */
    public async onDisable() {
        this.commands.clear();
        // TODO: clear commands in dispatcher
    }

    /**
     * Register a command.
     */
    public async registerCommand(
        command: Command,
        sendAvailableCommands: boolean = true
    ) {
        if (!(command instanceof Command)) {
            throw new TypeError(`Command must be a class that extends Command`);
        }

        // hacky remove later
        command.api = 'rfc';

        if (command.id.split(':').length !== 2)
            throw new Error(
                `Failed to register command with name "${command.constructor.name}" as no namespace was found from the id.`
            );

        if (!command.dispatch)
            throw new Error(
                `Failed to register command with name "${command.constructor.name}" as no "execute" member was found.`
            );

        this.commands.set(command.id, command);
        //for (const [pos, argument] of command.arguments.getRegistered()) {
        //    // TODO: Check arguments, and see if return types are valid.
        //}

        if (sendAvailableCommands) {
            await this.sendAvailableCommands();
        }

        this.server
            .getLogger()
            .silly(`Command with id §b${command.id}§r registered`);
    }

    /**
     * Register a command into command manager by class.
     * @deprecated Use `registerCommand` instead
     */
    public async registerClassCommand(command: Command, server: Server) {
        this.server
            .getLogger()
            .warn(
                `Brigadier API being deprecated soon. Use registerCommand() for: ${command.constructor.name} instead.`
            );
        if (command.id.split(':').length !== 2)
            throw new Error(`command is missing required "namespace" part of id`);

        if (!command?.register)
            this.server
                .getLogger()
                .warn(
                    `Command is missing "register" member. This is unsupported!`,
                    'CommandManager/registerClassCommand'
                );

        await command.register?.(this.dispatcher);
        this.commands.set(command.id, command);

        // this is bad habit for registering.
        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => player.getConnection().sendAvailableCommands())
        );

        this.server
            .getLogger()
            .silly(
                `Command with id §b${command.id}§r registered`,
                'CommandManager/registerClassCommand'
            );
    }

    /**
     * Get all enabled commands
     */
    public getCommands(): Map<string, Command> {
        return this.commands;
    }

    /**
     * Sends all registered commands to players.
     */
    public async sendAvailableCommands() {
        Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => {
                    await player.getConnection().sendAvailableCommands();
                })
        );
    }

    /**
     * Get a list of all command variants
     * EXCLUDING legacy commands
     * @deprecated
     */
    public getCommandsList(): Array<[string, CommandNode<CommandExecuter>, CommandArgument[][]]> {
        const parseNode = (node: CommandNode<CommandExecuter>): any[] => {
            if (node.getChildrenCount() <= 0) {
                return [
                    {
                        item: (node as ArgumentCommandNode<any, any>).getType(),
                        children: []
                    }
                ];
            }

            const res = Array.from(node.getChildren())
                .map((node) => {
                    return parseNode(node);
                })
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

        const res = Array.from(
            this.server.getCommandManager().getDispatcher().getRoot().getChildren()
        )
            .map((command) => {
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
            .flat()
            .filter((a) => a);

        res.toString = () => {
            return `${this.getCommandsList()
                .map((item) => {
                    if (!item[2].length) return `/${item[0]}`;
                    return item[2]
                        .map((entries) => {
                            return `/${item[0]} ${entries
                                .flat(Number.POSITIVE_INFINITY)
                                .map(
                                    (argument: any) =>
                                        argument.getReadableType?.() ?? argument.constructor.name
                                )
                                .join(' ')}`;
                        })
                        .join(`\n`);
                })
                .join('\n')}`;
        };
        return res as any;
    }

    /**
     * Get dispatcher
     */
    public getDispatcher(): CommandDispatcher<CommandExecuter> {
        return this.dispatcher;
    }

    /**
     * Dispatches a command and executes them.
     */
    public async dispatchCommand(sender: CommandExecuter, input = '') {
        try {
            // get the input command
            const cmd = [...this.commands.values()].find(
                (c) =>
                    c.id.split(':')[1] === input.split(' ')[0] ||
                    c?.aliases?.includes(input.split(' ')[0]) ||
                    c.label === input.split(' ')[0]
            );

            if (cmd?.api === 'rfc') {
                // begin parsing
                // todo: allow escaping qoutations, eg: \"
                const args = [
                    ...(input
                        .split(' ')
                        .slice(1)
                        .join(' ')
                        .match(/(\"([a-zA-Z0-9]|[\s\S])+"|[\S]+)/gi) ?? [])
                ]
                    .filter((a) => a !== undefined || a !== '' || a !== ' ')
                    .map((a) => {
                        if (a[0] === '"') {
                            return a.split('"')[1];
                        } else {
                            return a;
                        }
                    });

                const argumentsp: any[] = [];
                let skipIndex: number = 0;

                for (let i in args) {
                    const arg = args[i];

                    if (skipIndex > 0) {
                        skipIndex--;
                        continue;
                    }

                    for (const [n, v] of cmd.arguments.getRegistered()) {
                        if (v.length > 1) {
                            for (let overflow of v) {
                                try {
                                    const argVal: any | null = overflow.parse(
                                        sender,
                                        arg,
                                        argumentsp,
                                        args
                                    );
                                    if (argVal === null) {
                                        continue;
                                    }
                                    if (overflow.extendsTo === true) {
                                        // skip all remaining
                                        skipIndex = args.length;
                                    }
                                    if (
                                        typeof overflow.extendsTo === 'number'
                                    ) {
                                        skipIndex = overflow.extendsTo;
                                    }
                                    argumentsp.push(argVal);
                                    break;
                                } catch (e) {
                                    cmd.fallback(sender, argumentsp, e, args);
                                }
                            }
                        } else {
                            try {
                                const argVal: any | null = v[0]?.parse(
                                    sender,
                                    arg,
                                    argumentsp,
                                    args
                                );
                                if (argVal === null) {
                                    // fail silently
                                    continue;
                                } else {
                                    if (v[0]?.extendsTo === true) {
                                        // skip all remaining
                                        skipIndex = args.length;
                                    }
                                    if (typeof v[0]?.extendsTo === 'number') {
                                        skipIndex = v[0]?.extendsTo;
                                    }
                                    argumentsp.push(argVal);
                                }
                            } catch (e) {
                                cmd.fallback(sender, argumentsp, e, args);
                            }
                        }

                        if (!argumentsp[i]) {
                            // todo: optional chain when an argument is not fulfilled.
                            break;
                        }
                    }
                }
                try {
                    await cmd.dispatch(sender, argumentsp, args);
                } catch (e) {
                    try {
                        await cmd.fallback(sender, argumentsp, e, args);
                    } catch (er) {
                        this.server.getLogger().error(er);
                    }
                }
            } else {
                const parsed = this.dispatcher.parse(input.trim(), sender);
                const id = parsed.getReader().getString().split(' ')[0];

                // Get command from parsed string
                const command = Array.from(this.commands.values()).find(
                    (command) =>
                        command.id.split(':')[1] === id ||
                        command.aliases?.includes(id)
                );

                if (
                    !this.server
                        .getPermissionManager()
                        .can(sender)
                        .execute(command?.permission)
                ) {
                    await sender.sendMessage(
                        "§cI'm sorry, but you do not have permission to perform this command. " +
                            'Please contact the server administrators if you believe that this is in error.'
                    );
                    return;
                }

                let res: string[] = [];
                if (!command?.register && command?.execute) {
                    // Legacy commands
                    this.server
                        .getLogger()
                        .warn(
                            `${id} is using the legacy command format`,
                            'CommandManager/dispatchCommand'
                        );
                    res.push(
                        await command.execute(
                            sender as any,
                            parsed
                                .getReader()
                                .getString()
                                .replace(`${id} `, '')
                                .split(' ')
                        )
                    );
                } else {
                    // Handle aliases
                    if (command?.aliases?.includes(id)) {
                        await this.dispatchCommand(
                            sender,
                            input.replace(id, command.id.split(':')[1])
                        );
                        return;
                    }
                    res = await Promise.all(this.dispatcher.execute(parsed));
                }

                res.forEach(async (res: any) => {
                    const chat = new Chat(
                        this.server.getConsole(),
                        `§o§7[${sender.getUsername()}: ${
                            res ?? `issued server command: /${input}`
                        }]§r`,
                        '*.ops'
                    );

                    // TODO: should this be broadcasted to the executer?
                    await this.server.getChatManager().send(chat);
                });
            }
        } catch (error) {
            if (error?.type?.message?.toString?.() === 'Unknown command') {
                await sender.sendMessage(`§cUnknown command. Type "/help" for help.`);
                return;
            }

            await sender.sendMessage(`§c${error}`);
            this.server
                .getLogger()
                .debug(
                    `Player ${sender.getFormattedUsername()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server.getLogger().silly(`${error.stack}`, 'CommandManager/dispatchCommand');
        }
    }
}
