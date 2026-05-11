"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { testWuzapiConnection, updateWuzapiConfig } from "./actions";

type Initial = {
  wuzapiUrl: string;
  wuzapiToken: string;
  followUpEnabled: boolean;
};

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; connected: boolean }
  | { kind: "err"; message: string };

export function WuzapiForm({ initial }: { initial: Initial }) {
  const [wuzapiUrl, setWuzapiUrl] = useState(initial.wuzapiUrl);
  const [wuzapiToken, setWuzapiToken] = useState(initial.wuzapiToken);
  const [followUpEnabled, setFollowUpEnabled] = useState(initial.followUpEnabled);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateWuzapiConfig({
        wuzapiUrl: wuzapiUrl || null,
        wuzapiToken: wuzapiToken || null,
        followUpEnabled,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuração salva");
    });
  };

  const handleTest = () => {
    if (!wuzapiUrl || !wuzapiToken) {
      toast.error("Preencha URL e token antes de testar");
      return;
    }
    setTest({ kind: "loading" });
    startTransition(async () => {
      const result = await testWuzapiConnection({ wuzapiUrl, wuzapiToken });
      if (!result.ok) {
        setTest({ kind: "err", message: result.error });
        return;
      }
      setTest({ kind: "ok", connected: result.connected });
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Integração WhatsApp (Wuzapi)</h2>
        <p className="text-xs text-muted-foreground">
          Configure as credenciais da sua instância Wuzapi pra disparar
          mensagens automáticas de follow-up nos leads novos.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Credenciais</h3>

        <div className="space-y-1">
          <Label htmlFor="url">URL base da Wuzapi</Label>
          <Input
            id="url"
            value={wuzapiUrl}
            onChange={(e) => setWuzapiUrl(e.target.value)}
            placeholder="https://wuzapi.brunojusto.com.br"
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="token">Token da instância</Label>
          <Input
            id="token"
            type="password"
            value={wuzapiToken}
            onChange={(e) => setWuzapiToken(e.target.value)}
            placeholder={initial.wuzapiToken ? "(armazenado)" : ""}
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            Token vai no header <code>token: …</code> em toda chamada (não é
            Bearer). Pega no painel da Wuzapi → Instância → Token de API.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={pending || !wuzapiUrl || !wuzapiToken}
          >
            {test.kind === "loading" ? "Testando…" : "Testar conexão"}
          </Button>
          {test.kind === "ok" ? (
            <span className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {test.connected
                ? "Conectado ao WhatsApp"
                : "Credenciais ok, mas instância desconectada — gere QR no painel"}
            </span>
          ) : null}
          {test.kind === "err" ? (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="h-4 w-4" />
              {test.message}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Follow-up automático</h3>
            <p className="text-[11px] text-muted-foreground">
              Quando ligado, cada lead novo recebe a cadência oficial do
              playbook: 8 mensagens em 7 dias. Pausa automaticamente assim que
              o lead responde no WhatsApp ou muda de estágio.
            </p>
          </div>
          <Switch
            checked={followUpEnabled}
            onCheckedChange={setFollowUpEnabled}
            disabled={pending}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={pending} className="w-full">
        {pending ? "Salvando…" : "Salvar configuração"}
      </Button>
    </div>
  );
}
