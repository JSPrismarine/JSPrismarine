const Vector3 = require('../math/vector3').default;
const World = require('./world');


class Position extends Vector3 {

    /** @type {World} */
    world

    constructor(x, y, z, world) {
        super(x, y, z);
        this.world = world;
    }

    getWorld() {
        return this.world;
    }
    
}
module.exports = Position;
