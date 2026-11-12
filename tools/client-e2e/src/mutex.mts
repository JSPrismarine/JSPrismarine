/** One holder at a time, served in the order they asked. */
export interface Mutex {
    /** Resolves once every earlier holder has released, with this holder's release. */
    acquire(): Promise<() => void>;
}

/**
 * Creates a mutex that grants its turns in the order they were asked for.
 * @returns A mutex with no holder.
 */
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
