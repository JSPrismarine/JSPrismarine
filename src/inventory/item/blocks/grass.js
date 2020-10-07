const Item = require('../item');

class Grass extends Item {
    constructor() {
        super({
            name: 'minecraft:grass',
            id: 2,
            meta: 0,
            nbt: null,
            count: 1
        });
    }

}
module.exports = Grass;
