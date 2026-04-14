export interface MentalState {
  beliefs: Map<string, number>
  desires: string[]
  intentions: string[]
}

export interface Inference {
  type: 'belief' | 'desire' | 'intention'
  content: string
  confidence: number
}

export class TheoryOfMindAgent {
  private mentalStates: Map<string, MentalState> = new Map()

  updateMentalState(
    userId: string,
    beliefs: Map<string, number>,
    desires: string[],
    intentions: string[],
  ): void {
    this.mentalStates.set(userId, { beliefs, desires, intentions })
  }

  inferBelief(userId: string, topic: string): Inference | null {
    const state = this.mentalStates.get(userId)
    if (!state) return null

    const beliefKey = topic.toLowerCase()
    const confidence = state.beliefs.get(beliefKey) || 0.5

    return {
      type: 'belief',
      content: `User believes ${topic} with ${(confidence * 100).toFixed(0)}% confidence`,
      confidence,
    }
  }

  inferIntention(userId: string): Inference | null {
    const state = this.mentalStates.get(userId)
    if (!state || state.intentions.length === 0) return null

    return {
      type: 'intention',
      content: state.intentions[state.intentions.length - 1],
      confidence: 0.7,
    }
  }

  predictResponse(userId: string, stimulus: string): string {
    const intention = this.inferIntention(userId)
    if (intention) {
      return `Based on ${intention.content}, the user would likely respond with: ${stimulus}`
    }
    return `User responds to ${stimulus}`
  }
}

export function createTheoryOfMindAgent(): TheoryOfMindAgent {
  return new TheoryOfMindAgent()
}
