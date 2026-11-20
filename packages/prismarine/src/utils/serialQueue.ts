/** Runs tasks one at a time, in the order they were asked for, each after the one before it settled. */
export class SerialQueue {
    private tail: Promise<unknown> = Promise.resolve();

    /** Runs a task once every task asked for before it has settled, whether it failed or not. */
    public run<T>(task: () => Promise<T>): Promise<T> {
        const next = this.tail.then(task);
        this.tail = next.catch(() => {});
        return next;
    }
}
