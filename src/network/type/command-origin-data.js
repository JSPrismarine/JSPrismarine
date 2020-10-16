const UUID = require('../../utils/UUID');


class CommandOriginData {

    /** @type {number} */
    type
    /** @type {UUID} */
    uuid

    /** @type {string} */
    requestId
    
    /** @type {number|null} */
    uniqueEntityId = null
    
}
module.exports = CommandOriginData;
