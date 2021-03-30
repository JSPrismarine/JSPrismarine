export default class Timer {
    private startTime: any;
    private endTime?: any;

    public constructor() {
        this.startTime = process.hrtime();
    }

    public reset() {
        this.startTime = process.hrtime();
        this.endTime = null;
    }

    public stop(): number {
        this.endTime = process.hrtime(this.startTime);

        return this.getResult();
    }

    public getResult(): number {
        return Number.parseFloat(((this.endTime[0] * 1e9 + this.endTime[1]) / 1_000_000).toFixed(3));
    }
}
