/** A named command value table referenced by command aliases or parameters. */
export class CommandEnum {
    /** Table name as referenced by a command parameter or update packet. */
    public name!: string;
    /** Values in the order used by this table's packet-local indices. */
    public values!: string[];
    /** True when the client may update the values with `UpdateSoftEnumPacket`. */
    public soft?: boolean = false;
}
