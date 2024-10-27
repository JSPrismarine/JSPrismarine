import fastJWT from 'fast-jwt';
import { NetworkUtil } from '../../network/NetworkUtil';
import Device from '../../utils/Device';
import Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class LoginPacket extends DataPacket {
    public static NetID = Identifiers.LoginPacket;

    /**
     * The client's xbox live ID.
     */
    public XUID!: string;
    public identity!: string;

    /**
     * The client's username.
     */
    public displayName!: string;
    public protocol!: number;
    public identityPublicKey!: string;

    public clientRandomId!: number;
    public serverAddress!: string;
    public languageCode!: string;

    public device!: Device;
    public skin!: Skin;

    public decodePayload(): void {
        this.protocol = this.readInt();

        // TODO: content length, to validate it's lenght...
        this.readUnsignedVarInt();
        const chainData = JSON.parse(NetworkUtil.readLELengthASCIIString(this)) as any;
        const decode = fastJWT.createDecoder();

        for (const chain of chainData.chain) {
            const decodedChain = decode(chain);

            if (decodedChain.extraData) {
                this.XUID = decodedChain.extraData.XUID;
                this.identity = decodedChain.extraData.identity;
                this.displayName = decodedChain.extraData.displayName;
            }

            this.identityPublicKey = decodedChain.identityPublicKey;
        }

        const decodedJWT = decode(NetworkUtil.readLELengthASCIIString(this));
        this.skin = Skin.fromJWT(decodedJWT);
        this.device = new Device({
            id: decodedJWT.DeviceId,
            os: decodedJWT.DeviceOS,
            model: decodedJWT.DeviceModel,
            inputMode: decodedJWT.CurrentInputMode,
            guiScale: decodedJWT.GuiScale
        });

        this.clientRandomId = decodedJWT.ClientRandomId;
        this.serverAddress = decodedJWT.ServerAddress;
        this.languageCode = decodedJWT.LanguageCode;
    }

    public encodePayload(): void {
        /*
        TODO
        this.writeInt(Identifiers.Protocol);

        const stream = new BinaryStream();
        const data = JSON.stringify({
            chain: [
                "eyJhbGciOiJFUzM4NCIsIng1dSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFZitQNy94REozUFFTK2Vsb1M5WjhDdzczMG0vcndFZlZmaWg1QjBQZmtEdWR2QmlIeXJxUjhmaEg5YWJkRWRELzE3Sk9xZVdwZTRzcjB3Sk9FZDRRV05wbm5kYk90V0YzTXo1bk5aVU1rekEwaWE2V28vQnBQQ0hXR093Q3R5bWwifQo.eyJjZXJ0aWZpY2F0ZUF1dGhvcml0eSI6dHJ1ZSwiZXhwIjoxNjA2NDY5OTg4LCJpZGVudGl0eVB1YmxpY0tleSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFOEVMa2l4eUxjd2xacnlVUWN1MVR2UE9tSTJCN3ZYODNuZG5XUlVhWG03NHdGZmE1Zi9sd1FOVGZyTFZIYTJQbWVucEdJNkpoSU1VSmFXWnJqbU1qOTBOb0tORlNOQnVLZG04cllpWHNmYXozSzM2eC8xVTI2SHBHMFp4Sy9WMVYiLCJuYmYiOjE2MDYyOTcxMjh9Cg.2zvxWED0umE0fYgZlx6h3dIfPw1hv50Ug5DvtOXqVHBv2sfriTB7jkJSMGp2rnuNYS_Ir_Q4e9CSWA5AzuuuJ82Z3pp2SQuX7Yh1LplmvjAoiXfQqQr4_TaukBtGXmLd",
                "eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRThFTGtpeHlMY3dsWnJ5VVFjdTFUdlBPbUkyQjd2WDgzbmRuV1JVYVhtNzR3RmZhNWZcL2x3UU5UZnJMVkhhMlBtZW5wR0k2SmhJTVVKYVdacmptTWo5ME5vS05GU05CdUtkbThyWWlYc2ZhejNLMzZ4XC8xVTI2SHBHMFp4S1wvVjFWIiwiYWxnIjoiRVMzODQifQ.eyJuYmYiOjE2MDYyOTcxMjgsInJhbmRvbU5vbmNlIjotMjUxNjAzNDQ4NjM0NTA5NTk1NywiaXNzIjoiTW9qYW5nIiwiZXhwIjoxNjA2NDY5OTg4LCJjZXJ0aWZpY2F0ZUF1dGhvcml0eSI6dHJ1ZSwiaWF0IjoxNjA2Mjk3MTg4LCJpZGVudGl0eVB1YmxpY0tleSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFYUJTbjlvSWxsNm9Hdk5sTm1wXC9zRFJZTEZFVTlTZDJhZUFYNThSSGpLKzB0Nmx0WWVtWGFubXY1NVwvWlNqbjBXNUdZZkFHS0Y0T1lncWN0WWVieGxERWVYMFwvcDBYT1wvdytNUlwvS3ZwanFWejZZemdYNlRmQTc3c3dvTXVNUDRzSSJ9.FMfiGRUOjw6bI3H4ChYqgsHY4t8yWimq3Qu27D68wQwlBUiBeOdAFVb2NHLWKBXKBP3y3txbn9A65Xvrg9BWhVZPZz5pGLxwiRNl9f8iJJflfi3QfKMMaiLrjj8ZYQwl",
                "eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRWFCU245b0lsbDZvR3ZObE5tcFwvc0RSWUxGRVU5U2QyYWVBWDU4UkhqSyswdDZsdFllbVhhbm12NTVcL1pTam4wVzVHWWZBR0tGNE9ZZ3FjdFllYnhsREVlWDBcL3AwWE9cL3crTVJcL0t2cGpxVno2WXpnWDZUZkE3N3N3b011TVA0c0kiLCJhbGciOiJFUzM4NCJ9.eyJuYmYiOjE2MDYyOTk0MDksImV4dHJhRGF0YSI6eyJYVUlEIjoiMjUzNTQxMzY2MTMxMTUwMiIsImlkZW50aXR5IjoiZDRmNmQwNmItNDk4OS0zYWIwLTlkMDMtODA2OTRlMjQ3ZWJiIiwiZGlzcGxheU5hbWUiOiJIZXJyeVlUIiwidGl0bGVJZCI6Ijg5NjkyODc3NSJ9LCJyYW5kb21Ob25jZSI6LTYzOTA2MjgwNDA3MDg2MDkyNiwiaXNzIjoiTW9qYW5nIiwiZXhwIjoxNjA2Mzg1ODY5LCJpYXQiOjE2MDYyOTk0NjksImlkZW50aXR5UHVibGljS2V5IjoiTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVmK1A3XC94REozUFFTK2Vsb1M5WjhDdzczMG1cL3J3RWZWZmloNUIwUGZrRHVkdkJpSHlycVI4ZmhIOWFiZEVkRFwvMTdKT3FlV3BlNHNyMHdKT0VkNFFXTnBubmRiT3RXRjNNejVuTlpVTWt6QTBpYTZXb1wvQnBQQ0hXR093Q3R5bWwifQ.ya515qoCGluYhSwMHGHKRGaeCarrBr6mp0H9gCxJQ_8xLTGjKdyNGKeQFldoRqDTLCZsEITrLuAKBQkgSwXiVIbAehO6HeIbjESio6hVELUA9C2eelBasQODL-lE8kax"
            ]
        });

        stream.writeUnsignedVarInt(55309);  // Full length

        stream.writeLInt(Buffer.byteLength(data));
        stream.append(Buffer.from(data, 'utf8'));
        */
    }
}
