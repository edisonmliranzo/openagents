-- CreateTable
CREATE TABLE "CronJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleKind" TEXT NOT NULL DEFAULT 'every',
    "scheduleValue" TEXT NOT NULL,
    "sessionTarget" TEXT NOT NULL DEFAULT 'main',
    "payloadKind" TEXT NOT NULL DEFAULT 'systemEvent',
    "payloadText" TEXT NOT NULL,
    "deliveryMode" TEXT NOT NULL DEFAULT 'none',
    "deliveryTarget" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CronJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cronJobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "summary" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CronRun_cronJobId_fkey" FOREIGN KEY ("cronJobId") REFERENCES "CronJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
