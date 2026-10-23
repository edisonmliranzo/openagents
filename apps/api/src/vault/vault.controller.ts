import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { VaultService } from './vault.service'

import { CurrentUserId } from '../auth/current-user-id.decorator'

/**
 * The Secure Vault API.
 *
 * Note there is deliberately **no** endpoint that returns a secret's value.
 * Storing and listing are possible; reading the plaintext is not — the agent
 * uses a secret by name, and the server resolves it.
 */
@Controller('vault')
export class VaultController {
  constructor(private vault: VaultService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query('scope') scope?: string) {
    return this.vault.list(userId, scope)
  }

  @Post()
  put(@CurrentUserId() userId: string, @Body() body: { name: string; scope?: string; value: string; hint?: string }) {
    return this.vault.put(userId, body)
  }

  @Delete(':id')
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return { ok: await this.vault.delete(userId, id) }
  }
}
