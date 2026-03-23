// Zero-knowledge proof verification types
export interface ZKProof {
  id: string
  userId: string
  proofType: ZKProofType
  publicInputs: Record<string, unknown>
  proofData: string
  verificationResult: 'verified' | 'failed' | 'pending'
  verifiedAt?: string
  createdAt: string
}

export type ZKProofType =
  | 'data_integrity'
  | 'access_verification'
  | 'computation_correctness'
  | 'identity_verification'
  | 'consent_proof'

export interface ZKVerificationRequest {
  proofType: ZKProofType
  publicInputs: Record<string, unknown>
  proofData: string
  verificationKey?: string
}

export interface ZKVerificationResult {
  id: string
  isValid: boolean
  verificationTimeMs: number
  publicOutputs?: Record<string, unknown>
  error?: string
}

export interface ZKProofTemplate {
  id: string
  name: string
  description: string
  proofType: ZKProofType
  circuitDefinition: string
  publicInputSchema: Record<string, unknown>
  createdAt: string
}

export interface ZKCredential {
  id: string
  userId: string
  credentialType: string
  issuer: string
  issuedAt: string
  expiresAt?: string
  publicKey: string
  revocationList?: string
  metadata: Record<string, unknown>
}

export interface ZKPresentation {
  id: string
  userId: string
  credentialIds: string[]
  disclosedClaims: string[]
  proofData: string
  verificationResult?: ZKVerificationResult
  createdAt: string
}

export interface ZKVerifier {
  id: string
  name: string
  description: string
  verificationKey: string
  supportedProofTypes: ZKProofType[]
  requiresConsent: boolean
  createdAt: string
}
