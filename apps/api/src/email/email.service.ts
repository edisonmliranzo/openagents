import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private transporter: nodemailer.Transporter | null = null

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST')
    const user = config.get<string>('SMTP_USER')
    const pass = config.get<string>('SMTP_PASS')

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(config.get<string>('SMTP_PORT', '587')),
        secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: { user, pass },
      })
    }
  }

  async sendPasswordReset(to: string, resetUrl: string) {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured — skipping password reset email')
      return
    }

    const from = this.config.get<string>('SMTP_FROM', 'no-reply@openagents.us')

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Reset your OpenAgents password',
      text: `Click the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you did not request this, ignore this email.</p>`,
    })
  }
}
