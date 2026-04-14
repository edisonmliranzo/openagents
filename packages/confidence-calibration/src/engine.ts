export interface CalibrationResult {
  predictedConfidence: number
  actualConfidence: number
  calibrationError: number
}

export class ConfidenceCalibrationEngine {
  private predictions: Array<{ predicted: number; actual: number }> = []

  recordPrediction(predicted: number, actual: number): void {
    this.predictions.push({ predicted, actual })
  }

  calibrate(predicted: number): number {
    if (this.predictions.length < 10) return predicted

    const recent = this.predictions.slice(-100)
    const avgError = this.calculateAverageError(recent)

    const calibrated = predicted - avgError * 0.5
    return Math.max(0.1, Math.min(1.0, calibrated))
  }

  getCalibrationScore(): number {
    if (this.predictions.length < 10) return 0

    const recent = this.predictions.slice(-100)
    return 1 - this.calculateAverageError(recent)
  }

  private calculateAverageError(predictions: Array<{ predicted: number; actual: number }>): number {
    const totalError = predictions.reduce((sum, p) => {
      return sum + Math.abs(p.predicted - p.actual)
    }, 0)

    return totalError / predictions.length
  }

  isOverconfident(): boolean {
    const recent = this.predictions.slice(-20)
    if (recent.length < 5) return false

    const avgPredicted = recent.reduce((sum, p) => sum + p.predicted, 0) / recent.length
    const avgActual = recent.reduce((sum, p) => sum + p.actual, 0) / recent.length

    return avgPredicted > avgActual + 0.1
  }

  suggestAdjustment(): string {
    if (this.isOverconfident()) {
      return 'You tend to overestimate your confidence. Consider being more conservative.'
    }
    return 'Your confidence estimates are well calibrated.'
  }
}

export function createConfidenceCalibrationEngine(): ConfidenceCalibrationEngine {
  return new ConfidenceCalibrationEngine()
}
