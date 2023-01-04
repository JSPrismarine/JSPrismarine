import Leaves, { LeavesType } from './OakLeaves.js';
export default class JungleLeaves extends Leaves {
    public constructor() {
        super('minecraft:jungle_leaves', LeavesType.Jungle);
    }
}
