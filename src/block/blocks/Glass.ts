import Transparent from "../Transparent";
import { BlockIdsType } from "../BlockIdsType";

export default class Glass extends Transparent {
    constructor(
        name: string = "minecraft:glass",
        id: BlockIdsType = BlockIdsType.Glass
    ) {
        super({
            name,
            id,
            hardness: 0.3,
        });
    }
}
