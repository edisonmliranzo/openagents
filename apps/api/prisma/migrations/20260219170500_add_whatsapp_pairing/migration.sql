-- CreateTable
CREATE TABLE "WhatsAppDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME,
    "lastConversationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppPairing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phone" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "linkedAt" DATETIME,
    "consumedMessageSid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppPairing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppDevice_phone_key" ON "WhatsAppDevice"("phone");

-- CreateIndex
CREATE INDEX "WhatsAppDevice_userId_updatedAt_idx" ON "WhatsAppDevice"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppPairing_code_key" ON "WhatsAppPairing"("code");

-- CreateIndex
CREATE INDEX "WhatsAppPairing_userId_status_createdAt_idx" ON "WhatsAppPairing"("userId", "status", "createdAt");
