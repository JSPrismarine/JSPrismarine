const Item = require('../item')

class Stone extends Item {
    constructor() {
        super(1, 0, 1, null, 'minecraft:stone')
    }

}
module.exports = Stone
