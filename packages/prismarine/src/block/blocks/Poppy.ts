import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export enum FlowerType {
    Poppy = 0,
    BlueOrchid = 1,
    Allium = 2,
    Houstonia = 3,
    AzureBluet = 4,
    RedTulip = 5,
    OrangeTulip = 6,
    WhiteTulip = 7,
    PinkTulip = 8,
    OxeyeDaisy = 9,
    CornFlower = 10,
    LilyOfTheValley = 11
}

export default class Poppy extends Flowable {
    public constructor(
        name = 'minecraft:red_flower', // Supposed to be "red_flower"  //  TODO: to match runtime states is red_flower
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
