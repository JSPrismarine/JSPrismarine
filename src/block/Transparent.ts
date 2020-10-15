import Block from "./";

export default class Transparent extends Block {
    getLightFilter() {
        return 0;
    }

    isTransparent() {
        return true;
    }
};
