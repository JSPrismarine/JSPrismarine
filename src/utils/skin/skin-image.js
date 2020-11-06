class SkinImage {
    /** @type {number} */
    width;
    /** @type {number} */
    height;
    /** @type {string} */
    data;

    constructor({width, height, data}) {
        this.width = width;
        this.height = height;
        this.data = data;
    }
}
module.exports = SkinImage;
