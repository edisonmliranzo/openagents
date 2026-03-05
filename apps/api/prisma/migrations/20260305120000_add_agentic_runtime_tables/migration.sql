-- CreateTable
CREATE TABLE "MemoryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "piiRedacted" BOOLEAN NOT NULL DEFAULT true,
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoryFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceRef" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceUri" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "schemaJson" TEXT NOT NULL,
    "optionsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "outputJson" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "reviewerStatus" TEXT,
    "failureReason" TEXT,
    "validationIssues" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExtractionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CiIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT,
    "pipelineId" TEXT,
    "jobName" TEXT,
    "commitSha" TEXT,
    "logExcerpt" TEXT,
    "artifactUrls" TEXT NOT NULL DEFAULT '[]',
    "failureClass" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "suggestedFix" TEXT,
    "prUrl" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureFingerprint" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CiIncident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MemoryEvent_userId_createdAt_idx" ON "MemoryEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryEvent_userId_kind_updatedAt_idx" ON "MemoryEvent"("userId", "kind", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryFact_userId_entity_key_key" ON "MemoryFact"("userId", "entity", "key");

-- CreateIndex
CREATE INDEX "MemoryFact_userId_updatedAt_idx" ON "MemoryFact"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_userId_createdAt_idx" ON "ExtractionJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_status_updatedAt_idx" ON "ExtractionJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CiIncident_userId_createdAt_idx" ON "CiIncident"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CiIncident_repo_commitSha_idx" ON "CiIncident"("repo", "commitSha");

-- CreateIndex
CREATE INDEX "CiIncident_status_updatedAt_idx" ON "CiIncident"("status", "updatedAt");
