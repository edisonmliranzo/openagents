import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const SHADOW_KEY = 'shadow_mode'

@Injectable()
export class ShadowService {
  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(userId: string): Promise<boolean> {
    const flag = await this.prisma.userFlag.findUnique({
      where: { userId_key: { userId, key: SHADOW_KEY } },
      select: { value: true },
    })
    return flag?.value === '1'
  }

  async set(userId: string, on: boolean) {
    await this.prisma.userFlag.upsert({
      where: { userId_key: { userId, key: SHADOW_KEY } },
      create: { userId, key: SHADOW_KEY, value: on ? '1' : '0' },
      update: { value: on ? '1' : '0' },
    })
    return { shadowMode: on }
  }
}
