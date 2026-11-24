/// <reference types="vite/client" />

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.svg?url' {
  const src: string;
  export default src;
}
