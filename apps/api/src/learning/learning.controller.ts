import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LearningService, InteractionEntry } from './learning.service';
import { SkillSuggesterService } from './skill-suggester.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('learning')
export class LearningController {
  constructor(
    private learning: LearningService,
    private suggester: SkillSuggesterService,
  ) {}

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

  @Get('suggestions')
  @ApiOperation({ summary: 'List pending skill suggestions (auto-generated from repeated patterns)' })
  async listSuggestions(@Req() req: any, @Query('status') status?: string) {
    return this.suggester.listSuggestions(req.user.id, status ?? 'pending')
  }

  @Post('suggestions/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force a suggestion sweep over learned patterns' })
  async generateSuggestions(@Req() req: any) {
    return this.suggester.generateSuggestions(req.user.id)
  }

  @Post('suggestions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a suggestion and save it as a reusable skill' })
  async approveSuggestion(@Req() req: any, @Param('id') id: string) {
    return this.suggester.approve(req.user.id, id)
  }

  @Post('suggestions/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a skill suggestion' })
  async dismissSuggestion(@Req() req: any, @Param('id') id: string) {
    return this.suggester.dismiss(req.user.id, id)
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
