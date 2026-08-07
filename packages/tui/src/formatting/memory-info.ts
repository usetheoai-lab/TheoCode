export function countMemoryFacts(memoryMd: string): number {
  const afterFacts = memoryMd.split('## Facts')[1]
  if (afterFacts === undefined) return 0
  const nextHeading = afterFacts.search(/^#{1,6}\s/m)
  const section = nextHeading === -1 ? afterFacts : afterFacts.slice(0, nextHeading)
  return (section.match(/^\s*[-*] /gm) ?? []).length
}
