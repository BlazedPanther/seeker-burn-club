declare module 'postgres' {
  interface Sql {
    begin<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
    end(): Promise<void>;
    unsafe(query: string, params?: any[]): Promise<any[]>;
    (template: TemplateStringsArray, ...params: any[]): Promise<any[]>;
  }
  function postgres(connectionString: string, options?: Record<string, any>): Sql;
  export default postgres;
}

declare module 'tweetnacl' {
  export const sign: {
    detached: {
      (message: Uint8Array, secretKey: Uint8Array): Uint8Array;
      verify: (message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) => boolean;
    };
    (message: Uint8Array, secretKey: Uint8Array): Uint8Array;
    open: (signedMessage: Uint8Array, publicKey: Uint8Array) => Uint8Array | null;
    keyPair: () => { publicKey: Uint8Array; secretKey: Uint8Array };
  };
  export default { sign };
}

declare module 'omggif' {
  export class GifWriter {
    constructor(buf: Buffer, width: number, height: number, opts?: {
      loop?: number;
      palette?: number[];
      background?: number;
    });
    addFrame(
      x: number, y: number, w: number, h: number,
      pixels: Uint8Array,
      opts?: { delay?: number; disposal?: number; transparent?: number; palette?: number[] },
    ): void;
    end(): number;
  }
  export class GifReader {
    constructor(buf: Buffer);
    readonly width: number;
    readonly height: number;
    readonly numFrames: () => number;
    decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8Array): void;
  }
}
