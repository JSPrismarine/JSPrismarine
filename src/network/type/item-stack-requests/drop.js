class Drop {
    /** @type {number} */
    count;
    /** @type {number} */
    from;
    /** @type {number} */
    randomly;

    constructor({count, from, randomly}) {
        this.count = count;
        this.from = from;
        this.randomly = randomly;
    }
}
module.exports = Drop;
