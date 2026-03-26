ALTER TABLE "UserSettings"
ADD COLUMN "beginnerMode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
