import { Suspense } from "react";
import { Skeletons } from "@/components/admin/finance/ui";
import StatusesPage from "@/components/admin/statuses/StatusesPage";

// Admin status management (C44). The page reads its filters from the URL,
// so it renders inside a Suspense boundary.

export default function AdminStatusesRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1280px]">
          <Skeletons count={4} className="h-24" />
        </div>
      }
    >
      <StatusesPage />
    </Suspense>
  );
}
