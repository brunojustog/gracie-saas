"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateChatwootConfig } from "./actions";

type Initial = {
  chatwootUrl: string;
  chatwootAccountId: number | null;
  chatwootApiToken: string;
  chatwootWebhookSecret: string;
  chatwootImportLabel: string;
};

export function ChatwootForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: Initial;
}) {
  const [chatwootUrl, setChatwootUrl] = useState(initial.chatwootUrl);
  const [accountId, setAccountId] = useState(
    initial.chatwootAccountId ? String(initial.chatwootAccountId) : "",
  );
  const [apiToken, setApiToken] = useState(initial.chatwootApiToken);
  const [webhookSecret, setWebhookSecret] = useState(initial.chatwootWebhookSecret);
  const [importLabel, setImportLabel] = useState(initial.chatwootImportLabel);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const idNum = accountId ? Number(accountId) : null;
    if (accountId && !Number.isInteger(idNum)) {
      toast.error("Account ID deve ser um inteiro");
      return;
    }
    startTransition(async () => {
      const result = await updateChatwootConfig({
        chatwootUrl: chatwootUrl || null,
        chatwootAccountId: idNum,
        chatwootApiToken: apiToken || null,
        chatwootWebhookSecret: webhookSecret || null,
        chatwootImportLabel: importLabel || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuração salva");
    });
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/webhooks/chatwoot/${tenantSlug}`
      : `/api/webhooks/chatwoot/${tenantSlug}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Integração Chatwoot</h2>
        <p className="text-xs text-muted-foreground">
          Cole as credenciais do Chatwoot pra puxar conversas. O webhook URL
          abaixo deve ser configurado no painel do Chatwoot pra que novos leads
          cheguem automaticamente no kanban.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <Label className="text-xs uppercase text-muted-foreground">
          Webhook URL deste tenant
        </Label>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-mono break-all">
            {webhookUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success("Copiado");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          No Chatwoot: Settings → Integrations → Webhooks → Add new. Cole esta URL
          e habilite os eventos <code>conversation_created</code>,{" "}
          <code>contact_created</code>, <code>message_created</code>.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Credenciais</h3>

        <div className="space-y-1">
          <Label htmlFor="url">URL base do Chatwoot</Label>
          <Input
            id="url"
            value={chatwootUrl}
            onChange={(e) => setChatwootUrl(e.target.value)}
            placeholder="https://chat.simplificaonline.site"
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="account">Account ID</Label>
          <Input
            id="account"
            type="number"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="ex: 1"
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="token">API token (outgoing — chamadas DA app)</Label>
          <Input
            id="token"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={initial.chatwootApiToken ? "(armazenado)" : ""}
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="secret">Webhook secret (incoming — Chatwoot → app)</Label>
          <Input
            id="secret"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={initial.chatwootWebhookSecret ? "(armazenado)" : ""}
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            Se preenchido, todo POST do Chatwoot deve incluir o header{" "}
            <code>X-Chatwoot-Webhook-Secret</code> com este valor (timingSafeEqual).
          </p>
        </div>

        <Button onClick={handleSave} disabled={pending} className="w-full">
          {pending ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Filtro de import por label</h3>
          <p className="text-xs text-muted-foreground">
            Quando preenchido, só conversas marcadas com essa label no Chatwoot
            entram como lead (webhook em tempo real + import histórico).
            Deixar em branco = importa tudo (comportamento padrão).
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="import-label">Label do Chatwoot</Label>
          <Input
            id="import-label"
            value={importLabel}
            onChange={(e) => setImportLabel(e.target.value)}
            placeholder="ex: lead"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            Comparação case-insensitive. A label precisa estar na conversa no
            momento em que o webhook chega — se for adicionada depois, o lead
            não entra automaticamente.
          </p>
        </div>

        <Button onClick={handleSave} disabled={pending} className="w-full">
          {pending ? "Salvando…" : "Salvar filtro"}
        </Button>
      </div>
    </div>
  );
}
