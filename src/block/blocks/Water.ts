import { BlockIdsType } from '../BlockIdsType';
import FlowingWater from './FlowingWater';

export default class Water extends FlowingWater {
    public constructor() {
        super('minecraft:water', BlockIdsType.Water);
    }
}
