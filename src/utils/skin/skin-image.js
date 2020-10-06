'use strict'

class SkinImage {

    /** @type {number} */
    width
    /** @type {number} */
    height
    /** @type {Buffer} */
    data

    constructor({width, height, data}) {
        this.width = width
        this.height = height
        this.data = data 
    }

}
module.exports = SkinImage