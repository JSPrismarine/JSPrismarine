import Block from "./Block";

export default class Transparent extends Block {
    getLightFilter() {
        return 0;
    }

    isTransparent() {
        return true;
    }
};
