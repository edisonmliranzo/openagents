import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { SpecialistsService } from './specialists.service'
import { SpecialistsController } from './specialists.controller'

@Module({
  imports: [PrismaModule],
  providers: [SpecialistsService],
  controllers: [SpecialistsController],
  exports: [SpecialistsService],
})
export class SpecialistsModule {}
