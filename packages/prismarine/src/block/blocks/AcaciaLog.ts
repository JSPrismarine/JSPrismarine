import Log, { LogType } from './OakLog';
export default class AcaciaLog extends Log {
    public constructor() {
        super('minecraft:acacia_log', LogType.Acacia);
    }
}
