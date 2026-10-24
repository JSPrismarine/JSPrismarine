import { Block } from './Block';

export default class Transparent extends Block {
    protected defaultLightFilter() {
        return 0;
    }

    public isTransparent() {
        return true;
    }
}
