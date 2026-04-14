export interface WorldState {
  entities: Map<string, unknown>
  relations: Map<string, string[]>
  facts: Map<string, number>
}

export class WorldModelAgent {
  private state: WorldState = {
    entities: new Map(),
    relations: new Map(),
    facts: new Map(),
  }

  updateEntity(id: string, data: unknown): void {
    this.state.entities.set(id, data)
  }

  addRelation(from: string, to: string): void {
    const existing = this.state.relations.get(from) || []
    existing.push(to)
    this.state.relations.set(from, existing)
  }

  addFact(fact: string, confidence: number = 1): void {
    const key = fact.toLowerCase()
    this.state.facts.set(key, confidence)
  }

  query(predicate: string): unknown {
    const key = predicate.toLowerCase()
    return this.state.facts.get(key)
  }

  predict(action: string): unknown[] {
    const related = this.state.relations.get(action) || []
    return related.map((id) => this.state.entities.get(id)).filter(Boolean)
  }

  getState(): WorldState {
    return {
      entities: new Map(this.state.entities),
      relations: new Map(this.state.relations),
      facts: new Map(this.state.facts),
    }
  }

  reset(): void {
    this.state = {
      entities: new Map(),
      relations: new Map(),
      facts: new Map(),
    }
  }
}

export function createWorldModelAgent(): WorldModelAgent {
  return new WorldModelAgent()
}
