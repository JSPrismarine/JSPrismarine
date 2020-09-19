const Command = require('./command')
const CommandData = require('../network/type/command-data')
const CommandParameter = require('../network/type/command-parameter')
const Player = require('../player')
const ConsoleSender = require('./console-sender')
const logger = require('../utils/logger')
const GamemodeCommand = require('./vanilla/gamemode-command')
const TellCommand = require('./vanilla/tell-command')
const TitleCommand = require('./vanilla/title-command')
const SayCommand = require('./vanilla/say-command')
const MeCommand = require('./vanilla/me-command')
const StopCommand = require('./vanilla/stop-command')
const KickCommand = require('./vanilla/kick-command')
const PluginsCommand = require('./vanilla/plugins-command')

'use strict'

class CommandManager {

    /** @type {Set<Command>} */
    #commands = new Set()

    constructor() {
        // Register vanilla commands
        this.registerClassCommand(new GamemodeCommand())
        this.registerClassCommand(new TellCommand())
        this.registerClassCommand(new TitleCommand())
        this.registerClassCommand(new SayCommand())
        this.registerClassCommand(new MeCommand())
        this.registerClassCommand(new StopCommand())
        this.registerClassCommand(new KickCommand())
        this.registerClassCommand(new PluginsCommand())
    }
 
    /**
     * Registers a command into the command manager.
     * 
     * @param {string} name 
     * @param {string} description 
     * @param {function(ConsoleSender|Player)} execute 
     */
    registerCommand(name = '', description = '', execute = function(sender) {}) {
        let command = new Command({name, description})

        let parameter = new CommandParameter()
        parameter.name = 'args'
        parameter.type = 0x100000 | 0x22  // TODO: hardcoded values
        parameter.optional = true
        command.parameters.add(parameter)
        
        command.execute = execute

        this.#commands.add(command)
    } 

    /**
     * Register a command into command manager by class.
     * 
     * @param {Command} command 
     */
    registerClassCommand(command) {
        let parameter = new CommandParameter()
        parameter.name = 'args'
        parameter.type = 0x100000 | 0x22  // TODO: hardcoded values
        parameter.optional = true
        command.parameters.add(parameter)
        this.#commands.add(command)
    }
    
    /**
     * Dispatches a command and executes them.
     * 
     * @param {Player|ConsoleSender} sender 
     * @param {string} commandInput 
     */
    dispatchCommand(sender, commandInput = '') {
        if (!(commandInput.startsWith('/'))) {
            logger.warn('Received an invalid command!')
        }

        let commandParts = commandInput.split(' ')  // Name + arguments array
        let commandName = commandParts[0]
        let commandNameIndex = commandParts.indexOf(commandName)
        commandParts.splice(commandNameIndex, 1)

        // Check for numbers and convert them
        for (let argument of commandParts) {
            if (!isNaN(argument) && argument.trim().length != 0) { // command argument parsing fixed
                let argumentIndex = commandParts.indexOf(argument)
                commandParts[argumentIndex] = Number(argument)
            }
        }

        for (let command of this.#commands) {
            if (command.name === commandName.substr(1)) {
                return command.execute(sender, commandParts, commandName)
            }
        }
        
        if (sender instanceof Player) {
            sender.sendMessage('§cCannot find the desired command!')
        } else {
            logger.warn('Cannot find the desired command!')
        }
    }

    get commands() {
        return this.#commands
    }
}
module.exports = CommandManager