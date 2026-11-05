import { Module } from '@nestjs/common'
import { PhoneModule } from '../phone/phone.module'
import { ContactsController, OutreachController, VoiceConsoleController } from './growth-voice.controller'
import { ContactsService } from './contacts.service'
import { OutreachService } from './outreach.service'
import { VoiceConsoleService } from './voice-console.service'

/** Closed-loop outreach analytics, unified contact memory and the live voice console. */
@Module({
  imports: [PhoneModule],
  providers: [ContactsService, OutreachService, VoiceConsoleService],
  controllers: [OutreachController, ContactsController, VoiceConsoleController],
  exports: [ContactsService, OutreachService],
})
export class GrowthVoiceModule {}
