import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class YellowConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:yellow_concrete', ConcreteColorType.Yellow);
    }
}
