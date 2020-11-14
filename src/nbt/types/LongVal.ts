export default class LongVal {
    private value: bigint;
    
    public constructor(value: bigint = 0n) {
        this.value = value;
    }

    public getValue(): bigint {
        return this.value;
    }
}