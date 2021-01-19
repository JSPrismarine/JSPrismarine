/**
 * This is a special map, that allows overflow arguments.
 * This is for cases where you may want different argument types.
 */
import Argument from "./Argument";

export default class ArgumentMap {
    #_registered: Map<number, Argument[]>;
    #_mxOverflow: number

    public constructor(maxOverflow: number = -1) {
        this.#_registered = new Map();
        this.#_mxOverflow = maxOverflow;
    }

    /**
     * Adds an argument to the specified index. If index does not exist, it is created.
     * @param index
     * @param arg
     */
    public add(index: number, arg: Argument): boolean {
        if ((index != 0 && index > this.lastIndex + 1) || (index === 0 && index !== this.lastIndex)) {
            throw new Error(`Can not assign argument: "${arg.constructor.name}" to specified index of: ${index} because the previous index does not exist.`);
        }
        if (this.countOf(index) > this.#_mxOverflow) {
            throw new Error(`Can not assign argument: "${arg.constructor.name}" as it exceeds maximum amount of argument overflows allowed.`);
        } else {
            return this.append(index, arg);
        }
    }

    /**
     * Gets the arguments for the registered index.
     * @param index
     */
    public get(index: number): Argument[] {
        return this.#_registered.get(index) || [];
    }

    /**
     * Removes a argument index, or specific argument at an index or a specific argument by name.
     * @param indexOrArg - Argument or index argument to remove.
     */
    public remove(indexOrArg: number | Argument | string, predicate?: Argument | string): boolean {
        if (predicate) {
            let predName: string = predicate instanceof Argument ? predicate.constructor.name : predicate;
            if (typeof indexOrArg === 'number') {
                let cache: Argument[] = this.#_registered.get(indexOrArg) || [];
                let newargs: Argument[] = cache.filter(pred => pred.constructor.name !== predName);

                if (newargs.length === cache.length) {
                    return false;
                } else {
                    this.#_registered.set(indexOrArg, newargs);
                    return true;
                }
            } else {
                throw new Error("Predicate is ignored if provided before index.");
            }
        } else {
            // assume there is no predicate
            if (typeof indexOrArg === 'number') {
                this.#_registered.delete(indexOrArg);
                this.calculate();
                return true;
            } else {
                let predName: string = indexOrArg instanceof Argument ? indexOrArg.constructor.name : indexOrArg.toString();
                // check all arguments to check if they have a name matching the predicate.
                for (let [k, v] of this.#_registered) {
                    // this purges only the first match.
                    let filtered = v.filter(pred => pred.constructor.name !== predName);
                    if (filtered.length !== v.length) {
                        this.#_registered.set(k, filtered);
                        return true;
                    }
                }
                return false;
            }
        }
    }

    /**
     * Gets the amount of overflow argument registered to the given index.
     * @param index
     */
    public countOf(index: number): number {
        return this.#_registered.get(index)?.length || 0;
    }

    /**
     * A readonly value that represents the "last registered index" or "current argument length"
     */
    public get lastIndex(): number {
        return [...this.#_registered.keys()].sort((a, b) => a > b ? 1 : b > a ? -1 : 0).pop() || 0;
    }

    /**
     * Appends "adds" an argument to the given index.
     * @param index
     * @param value
     */
    private append(index: number, value: any): boolean {
        try {
            this.#_registered.set(index, [...(this.#_registered.get(index) || []), value]);
            return true;
        } catch {
            return false;
        }
    }


    /**
     * Removes indexes whose length is 0.
     */
    private calculate(): void {
        let newIndexes: Argument[][] = [];
        for (let [k, v] of this.#_registered) {
            if (v.length === 0) {
                continue;
            } else {
                newIndexes.push([...v]);
            }
        }
        this.#_registered.clear();

        for (let i = 0; i < newIndexes.length; i++) {
            this.#_registered.set(i, newIndexes[i]);
        }
    }
}