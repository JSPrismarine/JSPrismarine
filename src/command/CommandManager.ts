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
     * onEnable hook
     */
    public async onEnable() {
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
     * onDisable hook
     */
    public async onDisable() {
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
    public async dispatchCommand(sender: Player, commandInput = '') {
        if (!(commandInput.startsWith('/'))) {
            sender.sendMessage('Received an invalid command!');
        }

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

        let command: Command | null = null;
        if (namespace) {
            for (let c of this.commands) {
                if (c.id === `${namespace}:${commandName}` || c.id.split(':')[0] === namespace && c.aliases?.includes(commandName))
                    command = c;
            }
        } else {
            // TODO: handle multiple commands with same identifier
            // by prioritizing minecraft:->jsprismarine:->first hit
            for (let c of this.commands) {
                if (c.id.split(':')[1] === `${commandName}` || c.aliases?.includes(commandName))
                    command = c;
            }
        }

        if (!command)
            return sender.sendMessage('§cCannot find the desired command!');

        if (await this.server.getPermissionManager().can(sender).execute(command.permission)) {
            const res: string | void = await command.execute(sender, commandParts);

            const chat = new Chat(this.server.getConsole(), `§o§7[${sender.getUsername()}: ${res || `issued server command: ${commandInput}`}]§r`, '*.ops');
            this.server.getChatManager().send(chat);

            return;
        }

        return sender.sendMessage('§cYou do not have permission to perform this command!');
    }

    /**
     * Get all enabled commands
     */
    public getCommands(): Set<Command> {
        return this.commands;
    }
}
