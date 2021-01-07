import { BlockIdsType } from '../BlockIdsType';
import FlowingWater from './FlowingWater';

export default class Water extends FlowingWater {
    constructor() {
        super('minecraft:water', BlockIdsType.Water);
    }
}
