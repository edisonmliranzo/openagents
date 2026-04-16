import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LearningService, InteractionEntry } from './learning.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('learning')
export class LearningController {
  constructor(private learning: LearningService) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track an interaction for learning' })
  @ApiResponse({ status: 200, description: 'Interaction tracked successfully' })
  async trackInteraction(@Req() req: any, @Body() body: InteractionEntry) {
    const entry: InteractionEntry = {
      ...body,
      userId: req.user.id,
    };
    await this.learning.trackInteraction(entry);
    return { success: true, message: 'Interaction tracked for learning' };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get learning statistics' })
  @ApiResponse({ status: 200, description: 'Learning statistics retrieved' })
  async getStats(@Req() req: any) {
    return this.learning.getStats(req.user.id);
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Get learned patterns' })
  @ApiResponse({ status: 200, description: 'Patterns retrieved' })
  async getPatterns(@Req() req: any) {
    const patterns = await this.learning.getContextPatterns(req.user.id);
    return { patterns };
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all learning data for user' })
  @ApiResponse({ status: 200, description: 'Learning data cleared' })
  async clearLearning(@Req() req: any) {
    await this.learning.clearUserLearning(req.user.id);
    return { success: true, message: 'Learning data cleared' };
  }

  @Get('enhanced-context')
  @ApiOperation({ summary: 'Get enhanced system prompt with learned context' })
  @ApiResponse({ status: 200, description: 'Enhanced context retrieved' })
  async getEnhancedContext(@Req() req: any, @Body() body: { basePrompt?: string }) {
    const basePrompt = body.basePrompt || 'You are a helpful AI assistant.';
    const enhancedPrompt = await this.learning.getEnhancedSystemPrompt(req.user.id, basePrompt);
    return { enhancedPrompt };
  }
}
