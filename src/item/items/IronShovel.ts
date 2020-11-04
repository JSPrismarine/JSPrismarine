import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class IronShovel extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:iron_shovel",
                id: ItemIdsType.IronShovel,
            },
            ItemTieredToolType.Iron
        );
    }

    getMaxDurability() {
        return 251;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
