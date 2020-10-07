const Item = require('../item');

class Dirt extends Item {
    constructor() {
        super({
            name: 'minecraft:dirt',
            id: 3,
            meta: 0,
            nbt: null,
            count: 1
        });
    }

}
module.exports = Dirt;
