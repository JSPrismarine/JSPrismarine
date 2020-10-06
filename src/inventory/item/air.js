const Item = require('./item')

'use strict'

class ItemAir extends Item {

    constructor() {
        super(0, 0, 0, null, 'Air')
    }

}
module.exports = ItemAir