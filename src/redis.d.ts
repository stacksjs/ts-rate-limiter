/**
 * Type declarations for the optional `redis` npm package.
 *
 * The `redis` package is not a direct dependency of ts-rate-limiter.
 * It is dynamically imported at runtime as a fallback when Bun's native
 * Redis client is unavailable. This declaration satisfies the TypeScript
 * compiler without requiring the package to be installed.
 */
declare module 'redis' {
  export function createClient(options?: {
    url?: string
    socket?: {
      connectTimeout?: number
      reconnectStrategy?: false | ((retries: number) => number | Error)
    }
  }): {
    connect: () => Promise<void>
    disconnect: () => Promise<void>
    ping: () => Promise<string>
    on: (event: string, listener: (...args: any[]) => void) => void
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<string | null>
    del: (key: string) => Promise<number>
    incr: (key: string) => Promise<number>
    expire: (key: string, seconds: number) => Promise<boolean>
    ttl: (key: string) => Promise<number>
    send: (command: string, args: string[]) => Promise<unknown>
    close: () => void
  }
}
