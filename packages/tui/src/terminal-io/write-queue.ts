
const tails = new Map<string, Promise<unknown>>()

export function enqueue<T>(key: string, op: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve()
  const result = previous.then(op)
  tails.set(
    key,
    // eslint-disable-next-line no-restricted-syntax -- see the rationale above
    result.catch(() => undefined),
  )
  return result
}

export async function drain(key: string): Promise<void> {
  await (tails.get(key) ?? Promise.resolve())
}

export async function drainAll(): Promise<void> {
  await Promise.all([...tails.keys()].map((key) => drain(key)))
}
