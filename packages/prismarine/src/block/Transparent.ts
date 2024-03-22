import Block from './Block';

export default class Transparent extends Block {
    public getLightFilter() {
        return 0;
    }

    public isTransparent() {
        return true;
    }
}
