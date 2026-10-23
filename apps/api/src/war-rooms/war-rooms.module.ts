import { Module } from '@nestjs/common'
import { WarRoomService } from './war-rooms.service'
import { WarRoomsController } from './war-rooms.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { FrontierModule } from '../frontier/frontier.module'

@Module({
  imports: [PrismaModule, FrontierModule],
  providers: [WarRoomService],
  controllers: [WarRoomsController],
  exports: [WarRoomService],
})
export class WarRoomsModule {}
