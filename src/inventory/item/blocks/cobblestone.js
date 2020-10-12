const Item = require('../item');

class Stone extends Item {
    constructor() {
        super({
            name: 'minecraft:cobblestone',
            id: 4,
            meta: 0,
            nbt: null,
            count: 1
        });
    }

}
module.exports = Stone;
