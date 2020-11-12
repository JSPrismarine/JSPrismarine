export default class SkinPersonaPiece {
    public isDefault: boolean;
    public packId: string;
    public pieceId: string;
    public pieceType: string;
    public productId: string;

    constructor({
        isDefault,
        packId,
        pieceId,
        pieceType,
        productId
    }: {
        isDefault: boolean;
        packId: string;
        pieceId: string;
        pieceType: string;
        productId: string;
    }) {
        this.isDefault = isDefault;
        this.packId = packId;
        this.pieceId = pieceId;
        this.pieceType = pieceType;
        this.productId = productId;
    }
}
