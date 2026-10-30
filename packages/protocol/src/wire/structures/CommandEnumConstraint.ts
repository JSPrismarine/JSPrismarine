import type { CommandEnum } from './CommandEnum';

/** Restrictions applied to one value of a hard enum in `AvailableCommandsPacket`. */
export default class CommandEnumConstraint {
    private _enum!: CommandEnum;
    private valueOffset!: number;
    private constraints!: number[];

    /**
     * Associates a value in an enum with protocol constraint indices.
     * @param _enum - The hard enum containing the affected value.
     * @param valueOffset - The value's zero-based position in the enum.
     * @param constraints - Constraint identifiers encoded as bytes.
     */
    public constructor(_enum: CommandEnum, valueOffset: number, constraints: number[]) {
        if (!_enum.values[valueOffset]) {
            throw new Error(`Invalid enum value offset ${valueOffset}`);
        }
        this._enum = _enum;
        this.valueOffset = valueOffset;
        this.constraints = constraints;
    }

    /** @returns The hard enum that owns the constrained value. */
    public getEnum(): CommandEnum {
        return this._enum;
    }

    /** @returns The zero-based value position in the enum. */
    public getValueOffset(): number {
        return this.valueOffset;
    }

    /** @returns The string value selected by the stored position. */
    public getAffectedValue(): string {
        return this._enum.values[this.valueOffset]!;
    }

    /** @returns The byte-sized protocol constraint identifiers. */
    public getConstraints(): number[] {
        return this.constraints;
    }
}
