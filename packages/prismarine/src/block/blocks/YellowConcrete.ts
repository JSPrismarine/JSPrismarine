import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class YellowConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:yellow_concrete', ConcreteColorType.Yellow);
    }
}
