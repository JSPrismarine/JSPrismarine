import Player from "../player";
import Command from "./";

const path = require('path');
const fs = require('fs');
const logger = require('../utils/Logger');

export default class CommandManager {
    private commands: Set<Command> = new Set();

    constructor() {
        // Register vanilla commands
        const vanilla = fs.readdirSync(path.join(__dirname, 'vanilla'));
        vanilla.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./vanilla/${id}`);
            this.registerClassCommand(new (command.default || command)());
        });

        // Register jsprismarine commands
        const jsprismarine = fs.readdirSync(path.join(__dirname, 'jsprismarine'));
        jsprismarine.forEach((id: string) => {
            if (id.includes('.test.') || id.includes('.d.ts'))
                return;  // Exclude test files

            const command = require(`./jsprismarine/${id}`);
            this.registerClassCommand(new (command.default || command)());
        });

        logger.debug(`Registered §b${vanilla.length + jsprismarine.length}§r commands(s)!`);
    }

    /**
     * Register a command into command manager by class.
     * 
     * @param {Command} command 
     */
    public registerClassCommand(command: Command) {
        this.commands.add(command);
        logger.silly(`Command with id §b${command.id}§r registered`);
    }

    /**
     * Dispatches a command and executes them.
     * 
     * @param sender 
     * @param commandInput 
     */
    public dispatchCommand(sender: Player, commandInput = '') {
        if (!(commandInput.startsWith('/'))) {
            logger.warn('Received an invalid command!');
        }

        logger.info(`§b${sender.name}§r issued server command: §b${commandInput}§r!`);

        const commandParts: Array<any> = commandInput.substr(1).split(' ');  // Name + arguments array
        const namespace: string = commandParts[0].split(':').length === 2 ? commandParts[0].split(':')[0] : null;
        const commandName: string = commandParts[0].replace(`${namespace}:`, '');
        commandParts.splice(1);

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

        if (sender instanceof Player) {
            return sender.sendMessage('§cCannot find the desired command!');
        } else {
            return logger.warn('Cannot find the desired command!');
        }
    }

    public getCommands(): Set<Command> {
        return this.commands;
    }
}
