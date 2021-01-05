import Chat from '../chat/Chat';
import Command from './Command';
import { CommandDispatcher } from '@jsprismarine/brigadier';
import CommandExecuter from './CommandExecuter';
import Server from '../Server';
import fs from 'fs';
import path from 'path';
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

    /**
     * Dispatches a command and executes them.
     *
     * This should be refactored to supply the `command.execute` with
     * an array of objects containing the value and type.
     * We also need to start handling quotes.
     *
     * That will of course be a breaking change regarding plugins.
     * We could bypass that by introducing a new `command.handle`
     * function instead and deprecate the old `command.execute`.
     * -FS
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
            sender.sendMessage(`§c${err.getContext()}`);
        }
    }
}
