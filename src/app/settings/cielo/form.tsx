"use client";

import { CheckCircle2, Copy, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { regenerateCieloWebhookSecret, testCieloConnection, updateCieloConfig } from "./actions";

type Env = "sandbox" | "production";

type Initial = {
  cieloEnvironment: Env | null;
  cieloMerchantId: string;
  hasMerchantKey: boolean;
  cieloSopClientId: string;
  hasSopClientSecret: boolean;
  cieloWebhookSecret: string;
  cieloSoftDescriptor: string;
};

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; api: string; sop: string }
  | { kind: "err"; message: string };

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => toast.success("Copiado"),
              () => toast.error("Não foi possível copiar"),
            );
          }}
          aria-label={`Copiar ${label}`}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CieloForm({ initial, webhookUrl }: { initial: Initial; webhookUrl: string }) {
  const router = useRouter();
  const [environment, setEnvironment] = useState<Env | "off">(initial.cieloEnvironment ?? "off");
  const [merchantId, setMerchantId] = useState(initial.cieloMerchantId);
  const [merchantKey, setMerchantKey] = useState("");
  const [sopClientId, setSopClientId] = useState(initial.cieloSopClientId);
  const [sopClientSecret, setSopClientSecret] = useState("");
  const [softDescriptor, setSoftDescriptor] = useState(initial.cieloSoftDescriptor);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCieloConfig({
        cieloEnvironment: environment === "off" ? null : environment,
        cieloMerchantId: merchantId,
        cieloMerchantKey: merchantKey,
        cieloSopClientId: sopClientId,
        cieloSopClientSecret: sopClientSecret,
        cieloSoftDescriptor: softDescriptor,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMerchantKey("");
      setSopClientSecret("");
      toast.success("Configuração salva");
      router.refresh();
    });
  };

  const handleTest = () => {
    setTest({ kind: "loading" });
    startTransition(async () => {
      const result = await testCieloConnection();
      setTest(result.ok ? { kind: "ok", api: result.api, sop: result.sop } : { kind: "err", message: result.error });
    });
  };

  const handleRegenerate = () => {
    if (!window.confirm("Gerar um novo segredo? Você vai precisar atualizar o header no site da Cielo.")) return;
    startTransition(async () => {
      const r = await regenerateCieloWebhookSecret();
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cobrança no cartão (Cielo)</h2>
        <p className="text-xs text-muted-foreground">
          Mensalidade recorrente: o aluno cadastra o cartão uma vez por um link e a Cielo
          cobra todo mês sozinha. A baixa da mensalidade entra automática no sistema.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Credenciais da API E-commerce</h3>

        <div className="space-y-1">
          <Label>Ambiente</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as Env | "off")} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Desligado</SelectItem>
              <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
              <SelectItem value="production">Produção (cobrança real)</SelectItem>
            </SelectContent>
          </Select>
          {environment === "sandbox" ? (
            <p className="text-[11px] text-muted-foreground">
              Credenciais de teste grátis em cadastrosandbox.cieloecommerce.cielo.com.br. Use
              cartões de teste — o último dígito define o resultado (1 = aprovado, 2 = negado).
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="mid">MerchantId</Label>
          <Input id="mid" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} disabled={pending} className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mkey">MerchantKey</Label>
          <Input
            id="mkey"
            type="password"
            value={merchantKey}
            onChange={(e) => setMerchantKey(e.target.value)}
            placeholder={initial.hasMerchantKey ? "(armazenada — deixe vazio pra manter)" : ""}
            disabled={pending}
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="soft">Nome na fatura do cartão</Label>
          <Input
            id="soft"
            value={softDescriptor}
            onChange={(e) => setSoftDescriptor(e.target.value.slice(0, 13))}
            placeholder="GRACIEBARRA"
            maxLength={13}
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">Até 13 letras/números, sem espaço.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Silent Order Post (tokenização no navegador)</h3>
        <p className="text-[11px] text-muted-foreground">
          Obrigatório em produção: o número do cartão vai direto do celular do aluno pra Cielo,
          sem passar pelo nosso servidor. Gere as credenciais no site da Cielo (&quot;Como gerar a
          credencial SOP&quot;) e peça ao suporte da Cielo pra habilitar a <b>tokenização</b> no SOP.
        </p>
        <div className="space-y-1">
          <Label htmlFor="sopid">ClientId</Label>
          <Input id="sopid" value={sopClientId} onChange={(e) => setSopClientId(e.target.value)} disabled={pending} className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sopsecret">ClientSecret</Label>
          <Input
            id="sopsecret"
            type="password"
            value={sopClientSecret}
            onChange={(e) => setSopClientSecret(e.target.value)}
            placeholder={initial.hasSopClientSecret ? "(armazenado — deixe vazio pra manter)" : ""}
            disabled={pending}
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Notificações (webhook)</h3>
        <p className="text-[11px] text-muted-foreground">
          No site da Cielo: E-commerce → Gestão API E-commerce → Configurações → URL de
          notificações. Cole a URL, marque os eventos de pagamento e recorrência e adicione o
          header abaixo. Sem isso a baixa ainda acontece, mas só quando o cron de conciliação rodar.
        </p>
        <CopyField label="URL de notificação" value={webhookUrl} />
        {initial.cieloWebhookSecret ? (
          <>
            <CopyField label="Header — chave" value="X-Cielo-Secret" />
            <CopyField label="Header — valor" value={initial.cieloWebhookSecret} />
            <Button type="button" variant="outline" size="sm" onClick={handleRegenerate} disabled={pending}>
              Gerar novo segredo
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">O segredo do header é gerado ao salvar com a integração ligada.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={pending || environment === "off"}>
          {test.kind === "loading" ? "Testando…" : "Testar credenciais salvas"}
        </Button>
        {test.kind === "ok" ? (
          <span className="flex items-center gap-1 text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {test.api} · {test.sop}
          </span>
        ) : null}
        {test.kind === "err" ? (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <XCircle className="h-4 w-4" />
            {test.message}
          </span>
        ) : null}
      </div>

      <Button onClick={handleSave} disabled={pending} className="w-full">
        {pending ? "Salvando…" : "Salvar configuração"}
      </Button>
    </div>
  );
}
