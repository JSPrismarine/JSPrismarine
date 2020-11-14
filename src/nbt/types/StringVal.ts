import { hasMagic } from 'glob';

export default class StringVal {
    private value: string;

    public constructor(value: string = '') {
        this.value = value;
    }

    public getValue(): string {
        return this.value;
    }
}
