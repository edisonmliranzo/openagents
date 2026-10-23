import { Module } from '@nestjs/common'
import { GenerativeUIService } from './generative-ui.service'
import { GenerativeUIController } from './generative-ui.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [GenerativeUIService],
  controllers: [GenerativeUIController],
  exports: [GenerativeUIService],
})
export class GenerativeUIModule {}
