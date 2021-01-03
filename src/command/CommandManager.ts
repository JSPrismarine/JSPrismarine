import Chat from '../chat/Chat';
import Server from '../Server';
import Command from './Command';
import CommandExecuter from './CommandExecuter';

const path = require('path');
const fs = require('fs');

export default class CommandManager {
    private readonly commands: Set<Command> = new Set();
    private readonly server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        const time = Date.now();

        // Register vanilla commands
        const vanilla = fs.readdirSync(path.join(__dirname, 'vanilla'));
        vanilla.forEach((id: string) => {
            if (
                id.includes('.test.') ||
                id.includes('.d.ts') ||
                id.includes('.jsc') ||
                id.includes('.map')
            )
                return; // Exclude test files

            const command = require(`./vanilla/${id}`);
            this.registerClassCommand(
                new (command.default || command)(),
                this.server
            );
        });

        // Register jsprismarine commands
        const jsprismarine = fs.readdirSync(
            path.join(__dirname, 'jsprismarine')
        );
        jsprismarine.forEach((id: string) => {
            if (
                id.includes('.test.') ||
                id.includes('.d.ts') ||
                id.includes('.jsc') ||
                id.includes('.map')
            )
                return; // Exclude test files

            if (
                !this.server.getConfig().getEnableEval() &&
                id.includes('EvalCommand')
            )
                return;

            const command = require(`./jsprismarine/${id}`);
            this.registerClassCommand(
                new (command.default || command)(),
                this.server
            );
        });

        this.server
            .getLogger()
            .debug(
                `Registered §b${
                    (vanilla.length as number) + (jsprismarine.length as number)
                }§r commands(s) (took ${Date.now() - time} ms)!`,
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
    public registerClassCommand(command: Command, server: Server) {
        this.commands.add(command);
        server
            .getLogger()
            .silly(
                `Command with id §b${command.id}§r registered`,
                'CommandManager/registerClassCommand'
            );
    }

    /**
     * Dispatches a command and executes them.
     */
    public async dispatchCommand(sender: CommandExecuter, commandInput = '') {
        if (!commandInput.startsWith('/')) {
            sender.sendMessage('Received an invalid command!');
        }

        const commandParts: any[] = commandInput.slice(1).split(' '); // Name + arguments array
        const namespace: string =
            commandParts[0].split(':').length === 2
                ? commandParts[0].split(':')[0]
                : null;
        const commandName: string = commandParts[0].replace(
            `${namespace}:`,
            ''
        );
        commandParts.shift();

        // Check for numbers and convert them
        for (const argument of commandParts) {
            if (
                !Number.isNaN(Number.parseFloat(argument)) &&
                argument.trim().length > 0
            ) {
                // Command argument parsing fixed
                const argumentIndex = commandParts.indexOf(argument);
                commandParts[argumentIndex] = Number(argument);
            }
        }

        let command: Command | null = null;
        if (namespace) {
            for (const c of this.commands) {
                if (
                    c.id === `${namespace}:${commandName}` ||
                    (c.id.split(':')[0] === namespace &&
                        c.aliases?.includes(commandName))
                )
                    command = c;
            }
        } else {
            // TODO: handle multiple commands with same identifier
            // by prioritizing minecraft:->jsprismarine:->first hit
            for (const c of this.commands) {
                if (
                    c.id.split(':')[1] === `${commandName}` ||
                    c.aliases?.includes(commandName)
                )
                    command = c;
            }
        }

        if (!command)
            return sender.sendMessage('§cCannot find the desired command!');

        if (
            await this.server
                .getPermissionManager()
                .can(sender)
                .execute(command.permission)
        ) {
            const res: string | void = await command.execute(
                sender,
                commandParts.filter((a) => a !== null && a !== undefined)
            );

            const chat = new Chat(
                this.server.getConsole(),
                `§o§7[${sender.getUsername()}: ${
                    res ?? `issued server command: ${commandInput}`
                }]§r`,
                '*.ops'
            );
            await this.server.getChatManager().send(chat);
            return;
        }

        return sender.sendMessage(
            '§cYou do not have permission to perform this command!'
        );
    }

    /**
     * Get all enabled commands
     */
    public getCommands(): Set<Command> {
        return this.commands;
    }
}
