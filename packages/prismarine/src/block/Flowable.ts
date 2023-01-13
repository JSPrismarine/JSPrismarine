import Block from './Block.js';

export default class Flowable extends Block {
    public getHardness() {
        return 0;
    }

    public isSolid() {
        return false;
    }

    public canBeFlowedInto() {
        return true;
    }
}
