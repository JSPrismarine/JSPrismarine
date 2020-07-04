'use strict' 

class Vector3 {

    /** @type {number} */
    x 
    /** @type {number} */
    y 
    /** @type {number} */
    z

    constructor(x = 0, y = 0, z = 0) {
        this.x = x 
        this.y = y
        this.z = z
    }

}
module.exports = Vector3