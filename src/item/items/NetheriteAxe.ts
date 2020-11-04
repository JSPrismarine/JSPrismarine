import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class Axe extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:netherite_axe",
                id: ItemIdsType.NetheriteAxe,
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
