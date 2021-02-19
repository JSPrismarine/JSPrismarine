import Leaves, { LeavesType } from './OakLeaves';
export default class SpruceLeaves extends Leaves {
    public constructor() {
        super('minecraft:spruce_leaves', LeavesType.Spruce);
    }
}
