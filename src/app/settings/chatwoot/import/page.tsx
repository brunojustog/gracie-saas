import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ImportRunner } from "./import-runner";

export default async function ChatwootImportPage() {
  const { tenant } = await requireRole("ADMIN");

  const config = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      chatwootUrl: true,
      chatwootAccountId: true,
      chatwootApiToken: true,
    },
  });

  const configured = Boolean(
    config?.chatwootUrl && config.chatwootAccountId && config.chatwootApiToken,
  );

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">
          Configure o Chatwoot primeiro
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Pra importar contatos históricos, preciso de URL + Account ID + API
          token. Vai em <a className="underline" href="/settings/chatwoot">/settings/chatwoot</a> e
          preenche os campos.
        </p>
      </div>
    );
  }

  return <ImportRunner />;
}
