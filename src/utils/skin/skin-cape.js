const SkinImage = require('./skin-image');


class SkinCape {

    /** @type {String} */
    id

    /** @type {SkinImage} */
    image

    constructor({id, image}) {
        this.id = id;
        this.image = image;
    }

}

module.exports = SkinCape;
