
const caudas = new Map<string, Promise<unknown>>()

export function enqueue<T>(key: string, op: () => Promise<T>): Promise<T> {
  const previous = caudas.get(key) ?? Promise.resolve()
  const result = previous.then(op)
  caudas.set(
    key,
    // eslint-disable-next-line no-restricted-syntax -- ver racional acima
    result.catch(() => undefined),
  )
  return result
}

export async function drain(key: string): Promise<void> {
  await (caudas.get(key) ?? Promise.resolve())
}

export async function drainAll(): Promise<void> {
  await Promise.all([...caudas.keys()].map((key) => drain(key)))
}
