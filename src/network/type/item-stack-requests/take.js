const ItemStackRequestAction = require('./item-stack-request-action');

class Take extends ItemStackRequestAction {
    constructor() {
        super(0);
    }
}

module.exports = Take;
