/**
 * Type stub for @featherbear/presonus-studiolive-api (presonus-inspector package).
 * See packages/presonus-adapter/src/types/featherbear.d.ts for rationale.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@featherbear/presonus-studiolive-api' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Client: new (options: { host: string; port: number }) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Discovery: new () => any
}
