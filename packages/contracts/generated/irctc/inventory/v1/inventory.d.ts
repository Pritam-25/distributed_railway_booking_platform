import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import type { CallContext, CallOptions } from "nice-grpc-common";
export declare const protobufPackage = "irctc.inventory.v1";
export interface GetSeatDetailsRequest {
  scheduleId: string;
  seatId: string;
}
export interface GetSeatDetailsResponse {
  scheduleId: string;
  seatId: string;
  trainId: string;
  coachId: string;
  coachNumber: string;
  seatNumber: number;
  seatType: string;
  pricePerKm: number;
  version: number;
}
export declare const GetSeatDetailsRequest: MessageFns<GetSeatDetailsRequest>;
export declare const GetSeatDetailsResponse: MessageFns<GetSeatDetailsResponse>;
export type InventoryServiceDefinition = typeof InventoryServiceDefinition;
export declare const InventoryServiceDefinition: {
  readonly name: "InventoryService";
  readonly fullName: "irctc.inventory.v1.InventoryService";
  readonly methods: {
    readonly getSeatDetails: {
      readonly name: "GetSeatDetails";
      readonly requestType: typeof GetSeatDetailsRequest;
      readonly requestStream: false;
      readonly responseType: typeof GetSeatDetailsResponse;
      readonly responseStream: false;
      readonly options: {};
    };
  };
};
export interface InventoryServiceImplementation<CallContextExt = {}> {
  getSeatDetails(
    request: GetSeatDetailsRequest,
    context: CallContext & CallContextExt,
  ): Promise<DeepPartial<GetSeatDetailsResponse>>;
}
export interface InventoryServiceClient<CallOptionsExt = {}> {
  getSeatDetails(
    request: DeepPartial<GetSeatDetailsRequest>,
    options?: CallOptions & CallOptionsExt,
  ): Promise<GetSeatDetailsResponse>;
}
type Builtin =
  Date | Function | Uint8Array | string | number | boolean | undefined;
export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends globalThis.Array<infer U>
    ? globalThis.Array<DeepPartial<U>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T extends {}
        ? {
            [K in keyof T]?: DeepPartial<T[K]>;
          }
        : Partial<T>;
type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin
  ? P
  : P & {
      [K in keyof P]: Exact<P[K], I[K]>;
    } & {
      [K in Exclude<keyof I, KeysOfUnion<P>>]: never;
    };
export interface MessageFns<T> {
  encode(message: T, writer?: BinaryWriter): BinaryWriter;
  decode(input: BinaryReader | Uint8Array, length?: number): T;
  fromJSON(object: any): T;
  toJSON(message: T): unknown;
  create<I extends Exact<DeepPartial<T>, I>>(base?: I): T;
  fromPartial<I extends Exact<DeepPartial<T>, I>>(object: I): T;
}
export {};
//# sourceMappingURL=inventory.d.ts.map
