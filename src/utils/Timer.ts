export default class Timer {
    private startTime: any;
    private endTime?: any;

    public constructor() {
        this.startTime = process.hrtime();
    }

    public stop() {
        this.endTime = process.hrtime(this.startTime);

        return (this.endTime[1] / 1_000_000).toFixed(3);
    }
}
