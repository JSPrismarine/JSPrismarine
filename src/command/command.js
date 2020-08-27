const CommandData = require('../network/type/command-data')

'use strict'

class Command  {
    
    /** @type {CommandData} */
    data = new CommandData()

    constructor(name = '', description = '', flags = 0, permission = 0, aliases = [], parameters = new Set()) {
        this.data.name = name
        this.data.description = description
        this.data.flags = flags
        this.data.permission = permission
        this.data.aliases = aliases
        this.data.parameters = parameters
    }

    /**
     * Called when the command is executed.
     * 
     * @param {Player|ConsoleSender} sender
     * @param {Array} args
     */
    execute(sender, args = []) {

    }

}
module.exports = Command