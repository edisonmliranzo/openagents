import { Module } from '@nestjs/common'
import { MemoryModule } from '../memory/memory.module'
import { PrismaModule } from '../prisma/prisma.module'
import { LibraryService } from './library.service'
import { LibraryController } from './library.controller'

@Module({
  imports: [PrismaModule, MemoryModule],
  providers: [LibraryService],
  controllers: [LibraryController],
  exports: [LibraryService],
})
export class LibraryModule {}
