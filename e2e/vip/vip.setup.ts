import { test as setup } from "@playwright/test";
import { seedLane } from "./vip-fixtures";

// Seeds both viewport lanes (desktop "d", mobile "e"). Run once before the
// vip-desktop / vip-mobile projects; vip.teardown.ts removes everything.
setup("seed VIP purchase fixtures", async () => {
  setup.setTimeout(180_000);
  await seedLane("d");
  await seedLane("e");
});
