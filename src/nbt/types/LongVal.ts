export default class LongValue {
    private readonly value: bigint;

    public constructor(value = 0n) {
        this.value = value;
    }

    public getValue(): bigint {
        return this.value;
    }
}
