const CommandParameter = require('./CommandParameter').default;

class CommandData {
    /** @type {String} */
    name;
    /** @type {String} */
    description;
    /** @type {number} */
    flags;
    /** @type {number} */
    permission;
    /** @type {Array} */
    aliases = [];
    /** @type {Set<CommandParameter>} */
    parameters = new Set();
}
module.exports = CommandData;
