-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "activeSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "plannedDate" TIMESTAMP(3),
ADD COLUMN     "restDeadline" TIMESTAMP(3),
ADD COLUMN     "restSeconds" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "resumedAt" TIMESTAMP(3),
ADD COLUMN     "startKey" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateTitle" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkoutSet" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rir" DOUBLE PRECISION,
ADD COLUMN     "targetReps" INTEGER,
ADD COLUMN     "targetWeight" DOUBLE PRECISION,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'WORKING';

-- AlterTable
ALTER TABLE "WorkoutTemplateSet" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'WORKING';

-- CreateTable
CREATE TABLE "ExerciseMuscle" (
    "exerciseId" TEXT NOT NULL,
    "muscle" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ExerciseMuscle_pkey" PRIMARY KEY ("exerciseId","muscle")
);

-- CreateTable
CREATE TABLE "ExerciseEquipment" (
    "exerciseId" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,

    CONSTRAINT "ExerciseEquipment_pkey" PRIMARY KEY ("exerciseId","equipment")
);

-- CreateTable
CREATE TABLE "ProgressionRule" (
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "increment" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProgressionRule_pkey" PRIMARY KEY ("templateId","exerciseId")
);

-- CreateTable
CREATE TABLE "TemplateSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "TemplateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weight" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyGoal" (
    "userId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,

    CONSTRAINT "BodyGoal_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateSchedule_userId_weekday_effectiveFrom_idx" ON "TemplateSchedule"("userId", "weekday", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "BodyMeasurement_userId_date_key" ON "BodyMeasurement"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_userId_digest_key" ON "ImportBatch"("userId", "digest");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_startKey_key" ON "Workout"("startKey");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_userId_plannedDate_key" ON "Workout"("userId", "plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_userId_fingerprint_key" ON "Workout"("userId", "fingerprint");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseEquipment" ADD CONSTRAINT "ExerciseEquipment_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionRule" ADD CONSTRAINT "ProgressionRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionRule" ADD CONSTRAINT "ProgressionRule_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSchedule" ADD CONSTRAINT "TemplateSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSchedule" ADD CONSTRAINT "TemplateSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyGoal" ADD CONSTRAINT "BodyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
