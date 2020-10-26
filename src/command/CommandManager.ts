import Chat from "../chat/Chat";
import ChatEvent from "../events/chat/ChatEvent";
import Player from "../player";
import Prismarine from "../Prismarine";
import Command from "./";

const path = require('path');
const fs = require('fs');

export default class CommandManager {
    private commands: Set<Command> = new Set();
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onStart hook
     */
    public async onStart() {
        const time = Date.now();

        // Register vanilla commands
        const vanilla = fs.readdirSync(path.join(__dirname, 'vanilla'));
        vanilla.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./vanilla/${id}`);
            this.registerClassCommand(new (command.default || command)(), this.server);
        });

        // Register jsprismarine commands
        const jsprismarine = fs.readdirSync(path.join(__dirname, 'jsprismarine'));
        jsprismarine.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./jsprismarine/${id}`);
            this.registerClassCommand(new (command.default || command)(), this.server);
        });

        this.server.getLogger().debug(`Registered §b${vanilla.length + jsprismarine.length}§r commands(s) (took ${Date.now() - time} ms)!`);
    }

    /**
     * onExit hook
     */
    public async onExit() {
        this.commands.clear();
    }

    /**
     * Register a command into command manager by class.
     */
    public registerClassCommand(command: Command, server: Prismarine) {
        this.commands.add(command);
        server.getLogger().silly(`Command with id §b${command.id}§r registered`);
    }

    /**
     * Dispatches a command and executes them.
     */
    public dispatchCommand(sender: Player, commandInput = '') {
        if (!(commandInput.startsWith('/'))) {
            sender.sendMessage('Received an invalid command!');
        }

        // TODO: emit to global.ops
        const event = new ChatEvent(new Chat(this.server.getConsole(), `§o§7[${sender.getUsername()} issued server command: ${commandInput}]§r`));
        this.server.getEventManager().emit('chat', event);

        const commandParts: Array<any> = commandInput.substr(1).split(' ');  // Name + arguments array
        const namespace: string = commandParts[0].split(':').length === 2 ? commandParts[0].split(':')[0] : null;
        const commandName: string = commandParts[0].replace(`${namespace}:`, '');
        commandParts.shift();

        // Check for numbers and convert them
        for (let argument of commandParts) {
            if (!isNaN(argument as any) && argument.trim().length != 0) { // command argument parsing fixed
                let argumentIndex = commandParts.indexOf(argument);
                commandParts[argumentIndex] = Number(argument);
            }
        }

        if (namespace) {
            for (let command of this.commands) {
                if (command.id === `${namespace}:${commandName}` || command.id.split(':')[0] === namespace && command.aliases?.includes(commandName)) {
                    return command.execute(sender, commandParts);
                }
            }
        } else {
            // TODO: handle multiple commands with same identifier
            // by prioritizing minecraft:->jsprismarine:->first hit
            for (let command of this.commands) {
                if (command.id.split(':')[1] === `${commandName}` || command.aliases?.includes(commandName)) {
                    return command.execute(sender, commandParts);
                }
            }
        }

        return sender.sendMessage('§cCannot find the desired command!');
    }

    /**
     * Get all enabled commands
     */
    public getCommands(): Set<Command> {
        return this.commands;
    }
}
