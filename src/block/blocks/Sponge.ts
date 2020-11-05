import Solid from "../Solid";
import { BlockIdsType } from "../BlockIdsType";
import { BlockToolType } from "../BlockToolType";

export enum SpongeType {
    Dry = 0,
    Wet = 1,
}

export default class Sponge extends Solid {
    constructor(
        name: string = "minecraft:sponge",
        type: SpongeType = SpongeType.Dry
    ) {
        super({
            name: name,
            id: BlockIdsType.Sponge,
            hardness: 0.6,
        });
        this.meta = type;
    }

    // TODO: BlockToolType Hoe not yet included
    /* getToolType() {
        return BlockToolType.Hoe;
    } */
}
