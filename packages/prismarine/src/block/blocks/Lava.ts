import { BlockIdsType } from '../BlockIdsType';
import FlowingLava from './FlowingLava';

export default class Lava extends FlowingLava {
    public constructor() {
        super('minecraft:lava', BlockIdsType.Lava);
    }
}
