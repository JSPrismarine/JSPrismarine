const Skin = require('../../utils/skin/skin')
const UUID = require('../../utils/uuid')

'use strict'

class PlayerListEntry {

    /** @type {UUID} */
    uuid
    /** @type {number} */
    uniqueEntityId
    /** @type {string} */
    name
    /** @type {string} */
    xuid
    /** @type {string} */
    platformChatId
    /** @type {number} */
    buildPlatform
    /** @type {Skin} */
    skin
    /** @type {boolean} */
    isTeacher 
    /** @type {boolean} */ 
    isHost 

}
module.exports = PlayerListEntry