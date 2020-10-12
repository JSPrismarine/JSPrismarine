const ItemStackRequestAction = require('./item-stack-request-action');

class Place extends ItemStackRequestAction {
    constructor() {
        super(1);
    }
}

module.exports = Place;
