import { Module } from '@nestjs/common'
import { WarRoomService } from './war-rooms.service'
import { WarRoomsController } from './war-rooms.controller'

@Module({
  providers: [WarRoomService],
  controllers: [WarRoomsController],
  exports: [WarRoomService],
})
export class WarRoomsModule {}
