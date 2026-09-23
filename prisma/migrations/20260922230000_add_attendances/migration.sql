CREATE TABLE "Service" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "baseAmountCents" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Attendance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'performed',
  "baseAmountCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "finalAmountCents" INTEGER NOT NULL,
  "commissionCents" INTEGER NOT NULL,
  "amountToNaniCents" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Attendance_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "_ServiceEmployees" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_ServiceEmployees_A_fkey" FOREIGN KEY ("A") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_ServiceEmployees_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "_ServiceEmployees_AB_unique" ON "_ServiceEmployees"("A", "B");
CREATE INDEX "_ServiceEmployees_B_index" ON "_ServiceEmployees"("B");
CREATE INDEX "Attendance_employeeId_createdAt_idx" ON "Attendance"("employeeId", "createdAt");
CREATE INDEX "Attendance_serviceId_idx" ON "Attendance"("serviceId");
