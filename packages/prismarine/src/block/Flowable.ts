import { Block } from './Block';

export class Flowable extends Block {
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
