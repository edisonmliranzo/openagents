export interface SamlConfig {
  entryPoint: string
  issuer: string
  cert: string
  callbackUrl: string
  signatureAlgorithm?: string
}

export interface SamlAuthnRequest {
  id: string
  issueInstant: string
  issuer: string
  assertionConsumerServiceURL: string
}

export interface SamlResponse {
  success: boolean
  userId?: string
  email?: string
  name?: string
  groups?: string[]
  error?: string
}

export class SamlAuth {
  private config: SamlConfig

  constructor(config: SamlConfig) {
    this.config = config
  }

  generateAuthnRequest(): string {
    const id = `_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const issueInstant = new Date().toISOString()

    const request = {
      'samlp:AuthnRequest': {
        '@_xmlns:samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
        '@_xmlns:saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
        ID: id,
        Version: '2.0',
        IssueInstant: issueInstant,
        AssertionConsumerServiceURL: this.config.callbackUrl,
        Issuer: {
          '#text': this.config.issuer,
        },
      },
    }

    const xml = this.buildXml(request)
    const encoded = Buffer.from(xml).toString('base64')

    const params = new URLSearchParams({
      SAMLRequest: encoded,
      RelayState: '',
    })

    return `${this.config.entryPoint}?${params.toString()}`
  }

  async validateResponse(samlResponse: string): Promise<SamlResponse> {
    try {
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8')

      const responseDoc = this.parseXml(decoded)

      const statusCode = this.getElementText(responseDoc, 'StatusCode')
      if (statusCode && statusCode.includes('Success') === false) {
        const statusMessage = this.getElementText(responseDoc, 'StatusMessage')
        return { success: false, error: statusMessage || 'Authentication failed' }
      }

      const attributes = this.extractAttributes(responseDoc)

      return {
        success: true,
        userId: attributes.nameID || attributes.email,
        email: attributes.email,
        name: attributes.displayName,
        groups: attributes.groups,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid SAML response',
      }
    }
  }

  generateLogoutRequest(sessionIndex: string): string {
    const request = {
      'samlp:LogoutRequest': {
        '@_xmlns:samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
        '@_xmlns:saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
        ID: `_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        Version: '2.0',
        IssueInstant: new Date().toISOString(),
        Issuer: this.config.issuer,
        SessionIndex: sessionIndex,
      },
    }

    const xml = this.buildXml(request)
    return Buffer.from(xml).toString('base64')
  }

  private buildXml(obj: unknown): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>'

    const build = (o: unknown, indent: number = ''): string => {
      if (typeof o === 'string') {
        return o
      }

      if (Array.isArray(o)) {
        return o.map((item) => build(item, indent)).join('')
      }

      if (typeof o === 'object' && o !== null) {
        const lines: string[] = []
        for (const [key, value] of Object.entries(o)) {
          if (key.startsWith('@_')) continue

          const attrs = (o as Record<string, unknown>)[`@_${key}`]
          let attrStr = ''
          if (attrs && typeof attrs === 'object') {
            attrStr = Object.entries(attrs as Record<string, string>)
              .map(([k, v]) => `${k}="${v}"`)
              .join(' ')
          }

          if (typeof value === 'object' && value !== null) {
            const childXml = build(value, indent + '  ')
            if (key.includes(':')) {
              const [prefix] = key.split(':')
              const localName = key.split(':')[1]
              lines.push(`${indent}<${localName} ${attrStr}>${childXml}</${localName}>`)
            } else {
              lines.push(`${indent}<${key} ${attrStr}>${childXml}</${key}>`)
            }
          } else {
            const strValue = String(value)
            lines.push(`${indent}<${key} ${attrStr}>${strValue}</${key}>`)
          }
        }
        return lines.join('\n')
      }

      return ''
    }

    xml += '\n' + build(obj)
    return xml
  }

  private parseXml(xml: string): Document {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser()
      return parser.parseFromString(xml, 'text/xml')
    }

    return {
      getElementsByTagName: () => [],
      getAttribute: () => '',
      textContent: '',
    } as unknown as Document
  }

  private getElementText(doc: Document, tagName: string): string {
    const elements = doc.getElementsByTagName(tagName)
    return elements[0]?.textContent || ''
  }

  private extractAttributes(doc: Document): Record<string, string | string[]> {
    const attributes: Record<string, string | string[]> = {}

    const nameID = doc.getElementsByTagName('saml:NameID')
    if (nameID[0]) {
      attributes.nameID = nameID[0].textContent || ''
    }

    const attrStatements = doc.getElementsByTagName('saml:AttributeStatement')
    if (attrStatements[0]) {
      const attrs = attrStatements[0].getElementsByTagName('saml:Attribute')
      for (const attr of attrs) {
        const name = attr.getAttribute('Name') || attr.getAttribute('FriendlyName')
        const values = attr.getElementsByTagName('saml:AttributeValue')
        if (values.length === 1) {
          attributes[name || ''] = values[0].textContent || ''
        } else {
          attributes[name || ''] = Array.from(values).map((v) => v.textContent || '')
        }
      }
    }

    return {
      email:
        (attributes.email as string) ||
        (attributes[
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
        ] as string),
      displayName:
        (attributes.displayName as string) ||
        (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] as string),
      groups: (attributes.groups as string[]) || [],
    }
  }
}

export interface SamlAssertion {
  issuer: string
  subject: string
  attributes: Record<string, string | string[]>
  sessionIndex: string
  notBefore: number
  notOnOrAfter: number
}

export function createSamlClient(config: SamlConfig): SamlAuth {
  return new SamlAuth(config)
}
