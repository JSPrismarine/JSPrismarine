import Block from './Block';

export default class Flowable extends Block {
    getHardness() {
        return 0;
    }

    isSolid() {
        return false;
    }

    canBeFlowedInto() {
        return true;
    }
}
