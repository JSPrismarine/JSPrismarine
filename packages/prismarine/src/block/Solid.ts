import Block from './Block.js';

/**
 * Solid blocks (eg. Stone, Dirt etc)
 */
export default class Solid extends Block {
    public isSolid() {
        return true;
    }
}
