-- CreateTable
CREATE TABLE "DeviceInstall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loginCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInstall_userId_deviceHash_key" ON "DeviceInstall"("userId", "deviceHash");

-- CreateIndex
CREATE INDEX "DeviceInstall_lastSeenAt_idx" ON "DeviceInstall"("lastSeenAt");

-- CreateIndex
CREATE INDEX "DeviceInstall_userId_lastSeenAt_idx" ON "DeviceInstall"("userId", "lastSeenAt");
