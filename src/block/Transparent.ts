import Block from "./"

export default class Transparent extends Block {
    isTransparent() {
        return true;
    }

    getLightFilter() {
        return 0;
    }
};
