import { Module } from '@nestjs/common'
import { CodeEditorController } from './code-editor.controller'

@Module({
  controllers: [CodeEditorController],
  providers: [],
  exports: [],
})
export class CodeEditorModule {}
