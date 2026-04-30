# OpenAgents Task Tracker
## Completed Steps
- [x] Analyzed repo structure, TODO.md, open tabs, key chat files, docs via tools.

## Steps to Complete (from Approved Plan - Production Voice Stack + Image Upload)
1. [x] Create `apps/api/src/tts/tts.service.ts`
- [x] Create `apps/api/src/tts/tts.controller.ts`
- [x] Create `apps/api/src/tts/tts.module.ts`
- [x] Import TtsModule to app.module.ts
- [x] Create `apps/api/src/vision/image-upload.service.ts`
- [x] Import ImageUploadService to vision.module.ts

2. [ ] Update `apps/web/src/components/chat/ChatWindow.tsx` (drag-drop image UI)
3. [ ] Update `apps/web/src/components/chat/MessageBubble.tsx` (TTS play button)
4. [ ] Extend `packages/shared/src/types/conversation.ts` (audio artifact)
5. [ ] Update `apps/web/src/stores/chat.ts` (voice state)
6. [ ] Test: `pnpm turbo dev`, verify chat flow

