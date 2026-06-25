/**
 * Type stub for @featherbear/presonus-studiolive-api.
 *
 * The published package lacks dist/ files in the pnpm store (only source is patched).
 * This stub satisfies TypeScript's module resolution without requiring the built package.
 * The actual runtime behavior comes from the dynamic import() which pnpm resolves
 * via the patched dist/_internal.mjs / dist/api.cjs at runtime.
 *
 * All types are `any` since the featherbear API is used as a raw protocol adapter
 * (never exposed to domain layer) and the client variable is cast to `any` at usage sites.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@featherbear/presonus-studiolive-api' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Client: new (options: { host: string; port: number }) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Discovery: new () => any
}
