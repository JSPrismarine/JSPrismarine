import { Block } from './Block';

/**
 * Solid blocks (eg. Stone, Dirt etc)
 */
export class Solid extends Block {
    public isSolid() {
        return true;
    }
}
