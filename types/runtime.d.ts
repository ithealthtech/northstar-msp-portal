export {};

declare global {
  interface Error {
    code?: string;
    expose?: boolean;
    status?: number;
  }
}
