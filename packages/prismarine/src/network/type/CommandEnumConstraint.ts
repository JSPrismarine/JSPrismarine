import CommandEnum from './CommandEnum';

export default class CommandEnumConstraint {
    private _enum!: CommandEnum;
    private valueOffset!: number;
    private constraints!: number[];

    public constructor(_enum: CommandEnum, valueOffset: number, constraints: number[]) {
        // eslint-disable-next-line unused-imports/no-unused-vars
        (function (...$_: number[]): void {})(...constraints);
        if (!_enum.enumValues[valueOffset]) {
            throw new Error('Invalid enum value offset $valueOffset');
        }
        this._enum = _enum;
        this.valueOffset = valueOffset;
        this.constraints = constraints;
    }

    public getEnum(): CommandEnum {
        return this._enum;
    }

    public getValueOffset(): number {
        return this.valueOffset;
    }

    public getAffectedValue(): string {
        return this._enum.enumValues[this.valueOffset]!;
    }

    public getConstraints(): number[] {
        return this.constraints;
    }
}
