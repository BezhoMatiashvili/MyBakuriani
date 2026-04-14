import { test as teardown } from "@playwright/test";
import { cleanupTestData } from "./helpers/seed";
import fs from "fs";
import path from "path";

teardown("cleanup test database", async () => {
  await cleanupTestData();
  const usersFile = path.resolve(__dirname, ".test-users.json");
  if (fs.existsSync(usersFile)) fs.unlinkSync(usersFile);
});
