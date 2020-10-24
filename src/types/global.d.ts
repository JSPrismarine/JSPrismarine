export { };

declare global {
    interface LFloat extends Number { }

    interface VarInt extends Number { }
    interface UnsignedVarInt extends Number { }
    interface VarLong extends BigInt { }
    interface UnsignedVarLong extends BigInt { }
}
