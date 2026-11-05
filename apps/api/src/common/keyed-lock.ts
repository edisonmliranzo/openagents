/** Serialises async read-modify-write sections per key (in-process). */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>()

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(fn)
    const tail = next.catch(() => undefined)
    this.tails.set(key, tail)
    try {
      return await next
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
