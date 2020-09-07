const CommandData = require('../network/type/command-data')


'use strict'

class Command extends CommandData {

    /**
     * 
     * @param {{name: string, description: string, flags: number, permission: 0, aliases: Array<string>, parameters: Set<string>}} param0 
     */
    constructor({name = '', description = '', flags = 0, permission = 0, aliases = [], parameters = new Set()}) {
        super();
        this.name = name
        this.description = description
        this.flags = flags
        this.permission = permission
        this.aliases = aliases
        this.parameters = parameters
    }

    /**
     * Called when the command is executed.
     * 
     * @param {Player|ConsoleSender} sender
     * @param {Array} args
     * @param {String} commandName
     */
    execute(sender, args = [], commandName) {

    }

}
module.exports = Command