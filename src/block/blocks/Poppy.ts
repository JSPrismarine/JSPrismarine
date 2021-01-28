import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export enum FlowerType {
    Poppy = 0,
    BlueOrchid = 1,
    Allium = 2,
    AzureBluet = 3,
    RedTulip = 4,
    OrangeTulip = 5,
    WhiteTulip = 6,
    PinkTulip = 7,
    OxeyeDaisy = 8
}

export default class Poppy extends Flowable {
    public constructor(
        name = 'minecraft:poppy', // Supposed to be "red_flower"
        type: FlowerType = FlowerType.Poppy
    ) {
        super({
            name,
            id: BlockIdsType.RedFlower,
            hardness: 0
        });
        this.meta = type;
    }
}
