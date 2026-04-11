import { Module, Global } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { GlobalEventListener } from './global-event.listener'

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 100,
    }),
  ],
  providers: [GlobalEventListener],
  exports: [EventEmitterModule],
})
export class EventsModule {}
