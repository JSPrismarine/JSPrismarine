/** One holder at a time, served in the order they asked. */
export interface Mutex {
    /** Resolves once every earlier holder has released, with this holder's release. */
    acquire(): Promise<() => void>;
}

export const createMutex = (): Mutex => {
    let tail: Promise<void> = Promise.resolve();
    return {
        acquire: () => {
            let release: () => void = () => {};
            const released = new Promise<void>((resolve) => {
                release = resolve;
            });
            const turn = tail.then(() => release);
            tail = released;
            return turn;
        }
    };
};
