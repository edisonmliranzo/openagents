export interface CausalGraph {
  nodes: string[]
  edges: Array<{ from: string; to: string; strength: number }>
}

export class CausalReasoningEngine {
  private graph: CausalGraph = { nodes: [], edges: [] }

  addCausalLink(cause: string, effect: string, strength: number = 1): void {
    if (!this.graph.nodes.includes(cause)) this.graph.nodes.push(cause)
    if (!this.graph.nodes.includes(effect)) this.graph.nodes.push(effect)

    this.graph.edges.push({ from: cause, to: effect, strength })
  }

  inferCause(effect: string): string[] {
    return this.graph.edges
      .filter((e) => e.to === effect)
      .sort((a, b) => b.strength - a.strength)
      .map((e) => e.from)
  }

  inferEffect(cause: string): string[] {
    return this.graph.edges
      .filter((e) => e.from === cause)
      .sort((a, b) => b.strength - a.strength)
      .map((e) => e.to)
  }

  estimateEffect(cause: string, magnitude: number): Record<string, number> {
    const effects = this.inferEffect(cause)
    const result: Record<string, number> = {}

    for (const effect of effects) {
      const edge = this.graph.edges.find((e) => e.from === cause && e.to === effect)
      result[effect] = magnitude * (edge?.strength || 0.5)
    }

    return result
  }

  getCausalPath(from: string, to: string): string[] | null {
    const visited = new Set<string>()
    const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }]

    while (queue.length > 0) {
      const { node, path } = queue.shift()!

      if (node === to) return path

      if (visited.has(node)) continue
      visited.add(node)

      for (const effect of this.inferEffect(node)) {
        queue.push({ node: effect, path: [...path, effect] })
      }
    }

    return null
  }

  getGraph(): CausalGraph {
    return { ...this.graph, edges: [...this.graph.edges] }
  }
}

export function createCausalReasoningEngine(): CausalReasoningEngine {
  return new CausalReasoningEngine()
}
