import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class BrownCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:brown_carpet', CarpetColorType.Brown);
    }
}
