class ItemStackRequest {
    id
    actions

    constructor({ id, actions }) {
        this.id = id;
        this.actions = actions;
    }
}

module.exports = ItemStackRequest;
