import { test as setup } from "@playwright/test";
import { seedTestData } from "./helpers/seed";
import { saveTestUsers } from "./helpers/fixtures";

setup("seed test database", async () => {
  const { users } = await seedTestData();
  saveTestUsers(users);
});
