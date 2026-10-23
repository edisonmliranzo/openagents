import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { DocumentStore } from './document-store.service'

@Global()
@Module({
  providers: [PrismaService, DocumentStore],
  exports: [PrismaService, DocumentStore],
})
export class PrismaModule {}
