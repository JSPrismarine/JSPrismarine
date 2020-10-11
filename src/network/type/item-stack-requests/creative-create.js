const ItemStackRequestAction = require('./item-stack-request-action');

class CreativeCreate extends ItemStackRequestAction {
    itemId

    constructor({ itemId }) {
        super(11);
        this.itemId = itemId;
    }
}

module.exports = CreativeCreate;
