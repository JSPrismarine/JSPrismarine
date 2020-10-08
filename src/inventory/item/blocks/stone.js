const Item = require('../item');

class Stone extends Item {
    constructor() {
        super({
            name: 'minecraft:stone',
            id: 1,
            meta: 0,
            nbt: null,
            count: 1
        });
    }

}
module.exports = Stone;
