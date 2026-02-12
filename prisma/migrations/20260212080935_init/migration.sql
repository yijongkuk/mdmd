-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parcelPnu" TEXT,
    "appraisalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minBidPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bidStartDate" TEXT,
    "bidEndDate" TEXT,
    "gridSizeM" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "totalModules" INTEGER NOT NULL DEFAULT 0,
    "totalArea" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModulePlacement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "gridX" DOUBLE PRECISION NOT NULL,
    "gridY" DOUBLE PRECISION NOT NULL,
    "gridZ" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "materialId" TEXT,
    "customColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModulePlacement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ModulePlacement" ADD CONSTRAINT "ModulePlacement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
