const ItemStackRequestAction = require('./item-stack-request-action');

class Destroy extends ItemStackRequestAction {
    constructor() {
        super(4);
    }
}

module.exports = Destroy;
