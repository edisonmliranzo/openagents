export interface ThoughtNode {
  id: string
  content: string
  depth: number
  parentId: string | null
  children: string[]
  score: number
  status: 'pending' | 'explored' | 'pruned' | 'selected'
  value?: number
}

export interface TreeConfig {
  maxDepth: number
  maxBranches: number
  pruningThreshold: number
  explorationWeight: number
}

export class TreeOfThought {
  private nodes: Map<string, ThoughtNode> = new Map()
  private config: TreeConfig

  constructor(config: Partial<TreeConfig> = {}) {
    this.config = {
      maxDepth: 5,
      maxBranches: 3,
      pruningThreshold: 0.3,
      explorationWeight: 0.5,
      ...config,
    }
  }

  async explore(
    rootThought: string,
    evaluator: (node: ThoughtNode) => Promise<number>,
  ): Promise<ThoughtNode[]> {
    const root = this.createNode(rootThought, 0, null)
    this.nodes.set(root.id, root)

    await this.expand(root, evaluator)

    return this.getBestPath()
  }

  private async expand(
    node: ThoughtNode,
    evaluator: (n: ThoughtNode) => Promise<number>,
  ): Promise<void> {
    if (node.depth >= this.config.maxDepth) {
      node.status = 'explored'
      node.value = await evaluator(node)
      return
    }

    const candidates = await this.generateCandidates(node.content)

    for (const candidate of candidates.slice(0, this.config.maxBranches)) {
      const child = this.createNode(candidate, node.depth + 1, node.id)
      node.children.push(child.id)
      this.nodes.set(child.id, child)

      await this.expand(child, evaluator)
    }

    node.status = 'explored'
    node.value = await this.evaluateNode(node, evaluator)

    this.prune(node)
  }

  private async evaluateNode(
    node: ThoughtNode,
    evaluator: (n: ThoughtNode) => Promise<number>,
  ): Promise<number> {
    const selfScore = await evaluator(node)

    let childAvg = 0
    if (node.children.length > 0) {
      const childValues = node.children
        .map((id) => this.nodes.get(id)?.value)
        .filter((v): v is number => v !== undefined)
      childAvg =
        childValues.length > 0 ? childValues.reduce((a, b) => a + b, 0) / childValues.length : 0
    }

    return (
      selfScore * (1 - this.config.explorationWeight) + childAvg * this.config.explorationWeight
    )
  }

  private prune(node: ThoughtNode): void {
    for (const childId of node.children) {
      const child = this.nodes.get(childId)
      if (child && child.value !== undefined && child.value < this.config.pruningThreshold) {
        child.status = 'pruned'
      }
    }
  }

  private async generateCandidates(thought: string): Promise<string[]> {
    return [`Explore: ${thought}`, `Alternative: ${thought}`, `Detail: ${thought}`]
  }

  private createNode(content: string, depth: number, parentId: string | null): ThoughtNode {
    return {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      content,
      depth,
      parentId,
      children: [],
      score: 0,
      status: 'pending',
    }
  }

  private getBestPath(): ThoughtNode[] {
    const selected = Array.from(this.nodes.values())
      .filter((n) => n.status !== 'pruned')
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 3)

    const path: ThoughtNode[] = []
    for (const node of selected) {
      const ancestors = this.getAncestors(node)
      path.push(...ancestors)
    }

    return path
  }

  private getAncestors(node: ThoughtNode): ThoughtNode[] {
    const ancestors: ThoughtNode[] = [node]
    let current = node

    while (current.parentId) {
      const parent = this.nodes.get(current.parentId)
      if (parent) {
        ancestors.unshift(parent)
        current = parent
      } else {
        break
      }
    }

    return ancestors
  }
}

export function createTreeOfThought(config?: Partial<TreeConfig>): TreeOfThought {
  return new TreeOfThought(config)
}
