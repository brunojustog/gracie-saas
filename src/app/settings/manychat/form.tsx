"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { generateManychatSecret, updateManychatConfig } from "./actions";

type Initial = {
  manychatWebhookSecret: string;
};

export function ManychatForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: Initial;
}) {
  const [secret, setSecret] = useState(initial.manychatWebhookSecret);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateManychatConfig({
        manychatWebhookSecret: secret || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuração salva");
    });
  };

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateManychatSecret();
      setSecret(result.secret);
      toast.success("Novo secret gerado — salve a configuração e atualize no ManyChat");
    });
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/webhooks/manychat/${tenantSlug}`
      : `/api/webhooks/manychat/${tenantSlug}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Integração ManyChat</h2>
        <p className="text-xs text-muted-foreground">
          Receba leads automaticamente do ManyChat (Instagram, WhatsApp,
          Facebook) configurando o <code>External Request</code> dos seus flows
          pra apontar pro webhook abaixo.
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
          No ManyChat: dentro do flow, adicione uma ação{" "}
          <strong>External Request</strong> → método <code>POST</code>, cole esta
          URL e envie o JSON descrito abaixo. Use a mesma ação em vários flows
          (subscriber criado, tag aplicada, etc.) ajustando o campo{" "}
          <code>event</code>.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Secret de validação</h3>
        <p className="text-[11px] text-muted-foreground">
          Adicione um header <code>X-Manychat-Secret</code> no External Request
          com o valor abaixo. Sem secret configurado, o webhook aceita qualquer
          POST nessa URL — não use em produção.
        </p>

        <div className="space-y-1">
          <Label htmlFor="secret">Secret</Label>
          <div className="flex items-center gap-2">
            <Input
              id="secret"
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="(nenhum — sem validação)"
              disabled={pending}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={pending}
              title="Gerar secret aleatório"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {secret ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  toast.success("Copiado");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Formato do payload</h3>
        <p className="text-[11px] text-muted-foreground">
          O body da External Request deve ser JSON. Use as variáveis do
          ManyChat (<code>{"{{user_id}}"}</code>, <code>{"{{first_name}}"}</code>
          , etc.) pra preencher. <code>subscriber.id</code> é o único campo
          obrigatório.
        </p>
        <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
          {`{
  "event": "subscriber_created",
  "subscriber": {
    "id": "{{user_id}}",
    "name": "{{first_name}} {{last_name}}",
    "phone": "{{phone}}",
    "email": "{{email}}",
    "ig_username": "{{ig_username}}",
    "channel": "whatsapp"
  }
}`}
        </pre>
        <p className="text-[11px] text-muted-foreground">
          Eventos suportados:
        </p>
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-muted-foreground">
          <li>
            <code>subscriber_created</code> — cria um Lead novo no kanban
          </li>
          <li>
            <code>tag_applied</code> — adiciona tag (campo extra:{" "}
            <code>{`"tag": "<nome-da-tag>"`}</code>)
          </li>
          <li>
            <code>flow_response</code> — registra respostas (campo extra:{" "}
            <code>{`"fields"`}</code> = objeto chave/valor)
          </li>
          <li>
            <code>conversation_started</code> /{" "}
            <code>conversation_ended</code> — só atualiza última interação
          </li>
        </ul>
      </div>

      <Button onClick={handleSave} disabled={pending} className="w-full">
        {pending ? "Salvando…" : "Salvar configuração"}
      </Button>
    </div>
  );
}
