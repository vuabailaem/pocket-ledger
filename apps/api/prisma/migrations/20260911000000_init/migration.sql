CREATE TABLE "Account" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "openingBalance" INTEGER NOT NULL DEFAULT 0, "bankNumber" TEXT,
 CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Transaction" (
 "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "amount" INTEGER NOT NULL, "date" TEXT NOT NULL,
 "category" TEXT NOT NULL, "note" TEXT NOT NULL DEFAULT '', "source" TEXT NOT NULL DEFAULT 'manual',
 "externalId" TEXT, "transferId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Budget" (
 "id" TEXT NOT NULL, "month" TEXT NOT NULL, "category" TEXT NOT NULL, "amount" INTEGER NOT NULL,
 CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_bankNumber_key" ON "Account"("bankNumber");
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE UNIQUE INDEX "Budget_month_category_key" ON "Budget"("month", "category");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
