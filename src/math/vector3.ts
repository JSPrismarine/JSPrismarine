export default class Vector3 {
    /** @type {number} */
    #x: number
    /** @type {number} */
    #y: number
    /** @type {number} */
    #z: number

    constructor(x = 0, y = 0, z = 0) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
    }

    getX() {
        return this.#x;
    }

    getY() {
        return this.#y;
    }

    getZ() {
        return this.#z;
    }

}
