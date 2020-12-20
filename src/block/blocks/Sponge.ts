import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export enum SpongeType {
    Dry = 0,
    Wet = 1
}

export default class Sponge extends Solid {
    constructor(
        name: string = 'minecraft:sponge',
        type: SpongeType = SpongeType.Dry
    ) {
        super({
            name: name,
            id: BlockIdsType.Sponge,
            hardness: 0.6
        });
        this.meta = type;
    }
}
