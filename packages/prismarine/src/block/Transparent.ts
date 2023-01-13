import Block from './Block.js';

export default class Transparent extends Block {
    public getLightFilter() {
        return 0;
    }

    public isTransparent() {
        return true;
    }
}
