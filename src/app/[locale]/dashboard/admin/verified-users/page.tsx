import { Suspense } from "react";
import { Skeletons } from "@/components/admin/finance/ui";
import VerifiedUsersPage from "@/components/admin/verified-users/VerifiedUsersPage";

// Admin verified users and payer groups (C52). The tab and the search live in
// the URL, so the page renders inside a Suspense boundary. It reads nothing
// itself: every figure comes from /api/admin/verified-users/** (requireAdmin).

export default function AdminVerifiedUsersRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1280px]">
          <Skeletons count={4} className="h-24" />
        </div>
      }
    >
      <VerifiedUsersPage />
    </Suspense>
  );
}
