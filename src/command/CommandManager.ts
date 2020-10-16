import Player from "../player/Player";
import Prismarine from "../Prismarine";
import Command from "./";

const path = require('path');
const fs = require('fs');

export default class CommandManager {
    private commands: Set<Command> = new Set();

    constructor(server: Prismarine) {
        // Register vanilla commands
        const vanilla = fs.readdirSync(path.join(__dirname, 'vanilla'));
        vanilla.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./vanilla/${id}`);
            this.registerClassCommand(new (command.default || command)(), server);
        });

        // Register jsprismarine commands
        const jsprismarine = fs.readdirSync(path.join(__dirname, 'jsprismarine'));
        jsprismarine.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./jsprismarine/${id}`);
            this.registerClassCommand(new (command.default || command)(), server);
        });

        server.getLogger().debug(`Registered §b${vanilla.length + jsprismarine.length}§r commands(s)!`);
    }

    /**
     * Register a command into command manager by class.
     * 
     * @param {Command} command 
     */
    public registerClassCommand(command: Command, server: Prismarine) {
        this.commands.add(command);
        server.getLogger().silly(`Command with id §b${command.id}§r registered`);
    }

    /**
     * Dispatches a command and executes them.
     * 
     * @param sender 
     * @param commandInput 
     */
    public dispatchCommand(sender: Player, commandInput = '') {
        if (!(commandInput.startsWith('/'))) {
            sender.sendMessage('Received an invalid command!');
        }

        sender.getServer().getLogger().info(`§b${sender.name}§r issued server command: §b${commandInput}§r!`);

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

    public getCommands(): Set<Command> {
        return this.commands;
    }
}
