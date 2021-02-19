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

    public isDefault(): boolean {
        return this.def;
    }

    public getPackId(): string {
        return this.packId;
    }

    public getPieceType(): string {
        return this.pieceType;
    }

    public getProductId(): string {
        return this.productId;
    }

    public getPieceId(): string {
        return this.pieceId;
    }
}
