const Vector3 = require('../math/vector3')
const Level = require('./level')

'use strict'

class Position extends Vector3{
    /** @type {Level} */
    level

    constructor(x, y, z, level) {
        super(x, y, z)
        this.level = level
    }

    getLevel() {
        return this.level
    }
}
module.exports = Position