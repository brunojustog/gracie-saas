"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { generateSiteWebhookSecret, updateSiteWebhookConfig } from "./actions";

type Initial = {
  siteWebhookSecret: string;
};

export function SiteWebhookForm({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: Initial;
}) {
  const [secret, setSecret] = useState(initial.siteWebhookSecret);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateSiteWebhookConfig({
        siteWebhookSecret: secret || null,
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
      const result = await generateSiteWebhookSecret();
      setSecret(result.secret);
      toast.success("Novo secret gerado — salve e atualize no site");
    });
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/webhooks/site/${tenantSlug}`
      : `/api/webhooks/site/${tenantSlug}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Leads do site</h2>
        <p className="text-xs text-muted-foreground">
          Receba no kanban os contatos do formulário do site. Qualquer
          ferramenta que faça <code>POST</code> de JSON serve: o próprio site,
          Elementor, Zapier, n8n…
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
          Leads entram no primeiro estágio do funil com origem{" "}
          <strong>Site</strong>. Se o telefone ou e-mail já existir, o lead
          NÃO é duplicado — a mensagem nova entra no diário dele.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Secret de validação</h3>
        <p className="text-[11px] text-muted-foreground">
          Envie um header <code>X-Site-Webhook-Secret</code> com o valor
          abaixo — ou, se a ferramenta não suportar headers, anexe{" "}
          <code>?secret=&lt;valor&gt;</code> na URL. Sem secret configurado, o
          webhook aceita qualquer POST nessa URL — não use em produção.
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
          Body JSON. Só <code>name</code> é obrigatório.
        </p>
        <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
          {`{
  "name": "Maria Silva",
  "phone": "(11) 99999-8888",
  "email": "maria@email.com",
  "modality": "GB1",
  "address": "Tatuapé, São Paulo",
  "message": "Quero saber sobre aulas pro meu filho de 6 anos",
  "source": "formulario-home"
}`}
        </pre>
        <p className="text-[11px] text-muted-foreground">
          <code>modality</code> deve ser o nome EXATO de uma modalidade ativa
          (Configurações → Modalidades) — vira a modalidade do card no kanban.
          Nome desconhecido não dá erro: fica registrado no diário pro
          atendente classificar. <code>address</code> e <code>message</code>{" "}
          também vão pro diário do lead.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Exemplo de teste via terminal:
        </p>
        <pre className="overflow-x-auto rounded bg-muted/40 p-3 text-[11px] font-mono leading-relaxed">
          {`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Site-Webhook-Secret: <secret>" \\
  -d '{"name":"Teste Site","phone":"(11) 99999-0000","message":"olá"}'`}
        </pre>
      </div>

      <Button onClick={handleSave} disabled={pending} className="w-full">
        {pending ? "Salvando…" : "Salvar configuração"}
      </Button>
    </div>
  );
}
