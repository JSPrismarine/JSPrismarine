import Planks, { PlanksType } from './OakPlanks.js';

export default class BirchPlanks extends Planks {
    public constructor() {
        super('minecraft:birch_planks', PlanksType.Birch);
    }
}
