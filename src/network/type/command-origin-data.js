import UUID from '../../utils/UUID';


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
export default CommandOriginData;
