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

        return Array.from(
            this.server
                .getCommandManager()
                .getDispatcher()
                .getRoot()
                .getChildren()
        ).map((command) => {
            return [
                command.getName(),
                Array.from(command.getChildren()).map((node) => {
                    return parseNode(node);
                })
            ];
        });
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
            const res = await Promise.all(
                this.dispatcher.execute(this.dispatcher.parse(input, sender))
            );

            res.forEach(async (res: any) => {
                const chat = new Chat(
                    this.server.getConsole(),
                    `§o§7[${sender.getUsername()}: ${
                        res ?? `issued server command: ${input}`
                    }]§r`,
                    '*.ops'
                );
                await this.server.getChatManager().send(chat);
            });
        } catch (err) {
            sender.sendMessage(`§c${err}`);
        }
    }
}
