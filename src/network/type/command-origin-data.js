const UUID = require('../../utils/uuid');


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
