/** One equipped persona cosmetic with its pack, piece, type, and product identifiers. */
export default class SkinPersonaPiece {
    private readonly def: boolean;
    private readonly packId: string;
    private readonly pieceId: string;
    private readonly pieceType: string;
    private readonly productId: string;

    public constructor({
        def,
        packId,
        pieceId,
        pieceType,
        productId
    }: {
        def: boolean;
        packId: string;
        pieceId: string;
        pieceType: string;
        productId: string;
    }) {
        this.def = def; // "default" is not allowed keyword :(
        this.packId = packId;
        this.pieceId = pieceId;
        this.pieceType = pieceType;
        this.productId = productId;
    }

    /** Whether the client marks this piece as the default for its type. */
    public isDefault(): boolean {
        return this.def;
    }

    /** Returns the pack that supplies the cosmetic piece. */
    public getPackId(): string {
        return this.packId;
    }

    /** Returns the persona slot, such as body, hair, or face accessory. */
    public getPieceType(): string {
        return this.pieceType;
    }

    /** Returns the marketplace product identifier. */
    public getProductId(): string {
        return this.productId;
    }

    /** Returns the cosmetic piece identifier within its pack. */
    public getPieceId(): string {
        return this.pieceId;
    }
}
