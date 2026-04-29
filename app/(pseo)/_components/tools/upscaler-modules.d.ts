declare module 'upscaler' {
  export interface IUpscalerOptions {
    model?: unknown;
  }

  export interface IUpscaleOptions {
    output?: 'base64' | 'tensor';
    patchSize?: number;
    padding?: number;
  }

  export default class Upscaler {
    constructor(options?: IUpscalerOptions);
    upscale(
      image: string | HTMLImageElement | HTMLCanvasElement,
      options?: IUpscaleOptions
    ): Promise<string>;
    abort(): void;
  }
}

declare module '@upscalerjs/default-model' {
  const model: unknown;
  export default model;
}

declare module '@upscalerjs/esrgan-thick/2x' {
  const model: unknown;
  export default model;
}

declare module '@tensorflow/tfjs' {
  export function ready(): Promise<void>;
  export function setBackend(backend: string): Promise<boolean>;
  export function getBackend(): string;
}
