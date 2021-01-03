import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export enum FlowerType {
    Poppy = 0,
    BlueOrchid,
    Allium,
    Houstonia,
    TulipRed,
    TulipOrange,
    TulipWhite,
    TulipPink,
    OxeyeDaisy,
    CornFlower,
    LilyOfTheValley
}

export default class Poppy extends Flowable {
    constructor(
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
