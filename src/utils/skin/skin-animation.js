const SkinImage = require('./skin-image');

class SkinAnimation {
    /** @type {SkinImage} */
    image;
    /** @type {number} */
    frames;
    /** @type {number} */
    type;

    constructor({image, frames, type}) {
        this.image = image;
        this.frames = frames;
        this.type = type;
    }
}
module.exports = SkinAnimation;
