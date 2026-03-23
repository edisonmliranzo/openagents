import { Module } from '@nestjs/common'
import { TriggersController } from './triggers.controller'
import { TriggersService } from './triggers.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [TriggersController],
  providers: [TriggersService],
  exports: [TriggersService],
})
export class TriggersModule {}
