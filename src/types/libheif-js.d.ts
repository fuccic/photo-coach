// libheif-js ships no types; this covers the parts preview.ts uses.
declare module "libheif-js/wasm-bundle" {
  interface HeifImage {
    is_primary(): boolean;
    get_width(): number;
    get_height(): number;
    display(target: ImageData, done: (result: ImageData | null) => void): void;
    free(): void;
  }
  const libheif: { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };
  export default libheif;
}
