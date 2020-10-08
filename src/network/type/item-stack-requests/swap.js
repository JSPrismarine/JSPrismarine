const ItemStackRequestAction = require('./item-stack-request-action');

class Swap extends ItemStackRequestAction {
    from
    to

    constructor({ from, to }) {
        super(2);
        this.from = from;
        this.to = to;
    }
}

module.exports = Swap;
