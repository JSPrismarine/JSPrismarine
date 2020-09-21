const SkinImage = require('./skin-image')

'use strict'

class SkinCape {

    /** @type {String} */
    id

    /** @type {SkinImage} */
    image

    constructor({id, image}) {
        this.id = id
        this.image = image
    }

}

module.exports = SkinCape