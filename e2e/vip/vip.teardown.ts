import { test as teardown } from "@playwright/test";
import { cleanupLane } from "./vip-fixtures";

teardown("remove VIP purchase fixtures", async () => {
  teardown.setTimeout(180_000);
  await cleanupLane("d");
  await cleanupLane("e");
});
