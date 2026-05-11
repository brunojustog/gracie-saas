import { requireRole } from "@/server/tenant";

import { ImportRunner } from "./import-runner";

export default async function ImportCsvPage() {
  await requireRole("ADMIN");
  return <ImportRunner />;
}
