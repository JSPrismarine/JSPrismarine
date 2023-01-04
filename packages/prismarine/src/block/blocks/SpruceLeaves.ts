import Leaves, { LeavesType } from './OakLeaves.js';
export default class SpruceLeaves extends Leaves {
    public constructor() {
        super('minecraft:spruce_leaves', LeavesType.Spruce);
    }
}
