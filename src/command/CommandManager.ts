import {
    ArgumentCommandNode,
    CommandDispatcher
} from '@jsprismarine/brigadier';
import Chat from '../chat/Chat';
import Command from './Command';
import CommandExecuter from './CommandExecuter';
import CommandNode from '@jsprismarine/brigadier/dist/lib/tree/CommandNode';
import Server from '../Server';
import fs from 'fs';
import path from 'path';
import { CommandArgument } from './CommandArguments';
export default class CommandManager {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<CommandExecuter>;

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        const time = Date.now();
        this.dispatcher = new CommandDispatcher();

        const commands = [
            ...fs
                .readdirSync(path.join(__dirname, 'vanilla'))
                .map((a) => `/vanilla/${a}`),
            ...fs
                .readdirSync(path.join(__dirname, 'jsprismarine'))
                .map((a) => `/jsprismarine/${a}`)
        ];

        // Register jsprismarine commands
        commands.forEach(async (id: string) => {
            if (
                id.includes('.test.') ||
                id.includes('.d.ts') ||
                id.includes('.map')
            )
                return; // Exclude test files

            if (
                !this.server.getConfig().getEnableEval() &&
                id.includes('EvalCommand')
            )
                return;

            const Command = require(`./${id}`);
            const command: Command = new (Command.default || Command)();

            try {
                await this.registerClassCommand(command, this.server);
            } catch (err) {
                this.server
                    .getLogger()
                    .warn(`Failed to register command ${command.id}: ${err}`);
                this.server.getLogger().silly(err.stack);
            }
        });

        this.server
            .getLogger()
            .debug(
                `Registered §b${commands.length}§r commands(s) (took ${
                    Date.now() - time
                } ms)!`,
                'CommandManager/onEnable'
            );
    }

    /**
     * OnDisable hook
     */
    public async onDisable() {
        this.commands.clear();
    }

    /**
     * Register a command into command manager by class.
     */
    public async registerClassCommand(command: Command, server: Server) {
        if (!command.register)
            throw new Error(`command is missing required "register" method`);

        await command.register(this.dispatcher);
        this.commands.set(command.id, command);

        server
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

    public getCommandsList(): Array<[string, CommandArgument[][]]> {
        const parseNode = (node: CommandNode<CommandExecuter>): any[] => {
            if (node.getChildrenCount() <= 0) {
                return [(node as ArgumentCommandNode<any, any>).getType()];
            }

            return Array.from(node.getChildren())
                .map((node) => parseNode(node))
                .flat(Number.POSITIVE_INFINITY);
        };

        // FIXME: this misses a few arguments??
        const res = Array.from(
            this.server
                .getCommandManager()
                .getDispatcher()
                .getRoot()
                .getChildren()
        ).map((command) => {
            return [
                command.getName(),
                Array.from(command.getChildren()).map((node) => {
                    return parseNode(node).reverse();
                })
            ];
        });

        res.toString = () => {
            return `${this.getCommandsList()
                .map((item) => {
                    if (!item[1].length) return `/${item[0]}`;
                    return item[1]
                        .map((entries) => {
                            return `/${item[0]} ${entries
                                .flat(Number.POSITIVE_INFINITY)
                                .map(
                                    (argument: any) =>
                                        argument.getReadableType?.() ??
                                        argument.constructor.name
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
            const parsed = this.dispatcher.parse(input, sender);
            const id = parsed.getReader().getString().split(' ')[0];

            // Get command from parsed string
            const command = Array.from(this.commands.values()).find(
                (command) =>
                    command.id.split(':')[0] === id ||
                    command.aliases?.includes(id)
            );

            if (
                !this.server
                    .getPermissionManager()
                    .can(sender)
                    .execute(command?.permission)
            ) {
                await sender.sendMessage(
                    "I'm sorry, but you do not have permission to perform this command. " +
                        'Please contact the server administrators if you believe that this is in error.'
                );
                return;
            }

            // FIXME: handle aliases
            const res = await Promise.all(this.dispatcher.execute(parsed));

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
        } catch (error) {
            await sender.sendMessage(`§c${error}`);
            this.server
                .getLogger()
                .debug(
                    `Player ${sender.getFormattedUsername()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server
                .getLogger()
                .silly(`${error.stack}`, 'CommandManager/dispatchCommand');
        }
    }
}
