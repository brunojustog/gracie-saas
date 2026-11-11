"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectCardBrand, isLuhnValid, onlyDigits } from "@/lib/card-brand";

import { activateSandbox, activateWithCardToken, refreshSopToken } from "./actions";

/** API global do script Silent Order Post da Cielo/Braspag. */
type SopOptions = {
  accessToken: string;
  environment: "sandbox" | "production";
  language: "PT";
  enableTokenize: boolean;
  enableBinQuery: boolean;
  enableVerifyCard: boolean;
  cvvrequired: boolean;
  onSuccess: (r: { CardToken?: string; PaymentToken?: string }) => void;
  onError: (r: { Code?: string; Text?: string }) => void;
  onInvalid: (r: Array<{ Field: string; Message: string }>) => void;
};
declare global {
  interface Window {
    bpSop_silentOrderPost?: (opts: SopOptions) => void;
  }
}

function formatCardNumber(v: string) {
  return onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "MMAA" / "MM/AA" / "MM/AAAA" → "MM/AAAA" (formato da Cielo). */
function normalizeExpiration(v: string): string | null {
  const d = onlyDigits(v);
  if (d.length === 4) return `${d.slice(0, 2)}/20${d.slice(2)}`;
  if (d.length === 6) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return null;
}

function formatExpirationInput(v: string) {
  const d = onlyDigits(v).slice(0, 6);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function CardForm({
  token,
  mode,
  environment,
  sopAccessToken,
  sopScriptUrl,
  color,
}: {
  token: string;
  mode: "sop" | "sandbox";
  environment: "sandbox" | "production";
  sopAccessToken?: string;
  sopScriptUrl?: string;
  color: string;
}) {
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvv, setCvv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(mode !== "sop");
  const [pending, startTransition] = useTransition();
  const accessTokenRef = useRef(sopAccessToken ?? "");
  // A SOP lê os campos pelo DOM (classes bp-sop-*). O valor vai no formato
  // que ela espera, mas o input visível é o formatado.
  const hiddenExpRef = useRef<HTMLInputElement>(null);
  const hiddenNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== "sop" || !sopScriptUrl) return;
    if (window.bpSop_silentOrderPost) {
      queueMicrotask(() => setScriptReady(true));
      return;
    }
    const s = document.createElement("script");
    s.src = sopScriptUrl;
    s.async = true;
    s.onload = () => setScriptReady(true);
    s.onerror = () => setError("Não foi possível carregar o módulo seguro da Cielo. Recarregue a página.");
    document.body.appendChild(s);
  }, [mode, sopScriptUrl]);

  const brand = detectCardBrand(number);
  const digits = onlyDigits(number);
  const exp = normalizeExpiration(expiration);

  const validate = (): string | null => {
    if (holder.trim().length < 2) return "Informe o nome impresso no cartão.";
    if (!isLuhnValid(digits)) return "Número do cartão inválido.";
    if (!brand) return "Bandeira não reconhecida. Aceitamos Visa, Master, Elo, Amex, Hipercard e Diners.";
    if (!exp) return "Validade inválida (use MM/AA).";
    const [mm, yyyy] = exp.split("/").map(Number);
    const now = new Date();
    if (yyyy < now.getFullYear() || (yyyy === now.getFullYear() && mm < now.getMonth() + 1)) return "Cartão vencido.";
    if (!/^\d{3,4}$/.test(cvv)) return "Código de segurança inválido.";
    return null;
  };

  const finish = (r: Awaited<ReturnType<typeof activateWithCardToken>>) => {
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDone(
      r.chargedNow
        ? r.paid
          ? "Pronto! A mensalidade deste mês foi paga e as próximas serão cobradas automaticamente."
          : "Pronto! Cartão cadastrado — a cobrança deste mês está sendo processada."
        : `Pronto! Cartão cadastrado. A primeira cobrança será em ${r.startDate?.split("-").reverse().join("/")}.`,
    );
  };

  const submitSop = () => {
    const sop = window.bpSop_silentOrderPost;
    if (!sop) {
      setError("Módulo seguro da Cielo ainda carregando. Tente de novo em instantes.");
      return;
    }
    if (hiddenExpRef.current) hiddenExpRef.current.value = exp ?? "";
    if (hiddenNumberRef.current) hiddenNumberRef.current.value = digits;
    const last4 = digits.slice(-4);
    const b = brand!;
    startTransition(
      () =>
        new Promise<void>((resolve) => {
          const renew = async () => {
            // AccessToken é de uso único: pega outro pra próxima tentativa.
            const t = await refreshSopToken(token);
            if (t.ok) accessTokenRef.current = t.accessToken;
          };
          sop({
            accessToken: accessTokenRef.current,
            environment,
            language: "PT",
            enableTokenize: true,
            enableBinQuery: false,
            enableVerifyCard: false,
            cvvrequired: false,
            onSuccess: async (resp) => {
              if (!resp.CardToken) {
                setError("A Cielo não devolveu o token do cartão (tokenização não habilitada). Avise a academia.");
                await renew();
                resolve();
                return;
              }
              const r = await activateWithCardToken({ token, cardToken: resp.CardToken, brand: b, last4 });
              if (!r.ok) await renew();
              finish(r);
              resolve();
            },
            onError: async (resp) => {
              setError(`Erro na Cielo${resp?.Code ? ` (${resp.Code})` : ""}. Confira os dados e tente de novo.`);
              await renew();
              resolve();
            },
            onInvalid: async (list) => {
              setError(list.map((v) => v.Message).join(" ") || "Dados do cartão inválidos.");
              await renew();
              resolve();
            },
          });
        }),
    );
  };

  const submitSandbox = () => {
    startTransition(async () => {
      const r = await activateSandbox({ token, number: digits, holder: holder.trim(), expiration: exp, brand });
      finish(r);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "sop") submitSop();
    else submitSandbox();
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-sm">{done}</p>
        <p className="text-xs text-muted-foreground">Pode fechar esta página.</p>
      </div>
    );
  }

  return (
    // Sem `action`/`name` nos campos: nada é enviado por submit nativo. No modo
    // SOP o script da Cielo lê os campos pelas classes bp-sop-* e envia direto
    // pra Cielo; pro nosso servidor só vão token, bandeira e últimos 4 dígitos.
    <form onSubmit={handleSubmit} className="space-y-3" autoComplete="on">
      <div className="space-y-1">
        <Label htmlFor="cc-name">Nome impresso no cartão</Label>
        <Input
          id="cc-name"
          className="bp-sop-cardholdername"
          autoComplete="cc-name"
          value={holder}
          onChange={(e) => setHolder(e.target.value.toUpperCase())}
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cc-number">
          Número do cartão {brand ? <span className="text-xs text-muted-foreground">· {brand}</span> : null}
        </Label>
        <Input
          id="cc-number"
          inputMode="numeric"
          autoComplete="cc-number"
          value={formatCardNumber(number)}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="0000 0000 0000 0000"
          disabled={pending}
        />
        <input ref={hiddenNumberRef} type="hidden" className="bp-sop-cardnumber" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cc-exp">Validade</Label>
          <Input
            id="cc-exp"
            inputMode="numeric"
            autoComplete="cc-exp"
            value={formatExpirationInput(expiration)}
            onChange={(e) => setExpiration(e.target.value)}
            placeholder="MM/AA"
            disabled={pending}
          />
          <input ref={hiddenExpRef} type="hidden" className="bp-sop-cardexpirationdate" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cc-cvv">CVV</Label>
          <Input
            id="cc-cvv"
            className="bp-sop-cardcvv bp-sop-cardcvvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={cvv}
            onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
            placeholder="123"
            disabled={pending}
          />
        </div>
      </div>
      <input type="hidden" className="bp-sop-cardtype" value="creditCard" readOnly />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="submit"
        className="w-full text-white"
        style={{ background: color }}
        disabled={pending || !scriptReady}
      >
        {pending ? "Processando…" : !scriptReady ? "Carregando…" : "Cadastrar cartão"}
      </Button>
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        {mode === "sop"
          ? "Os dados do cartão vão direto para a Cielo, com criptografia."
          : "Ambiente de testes da Cielo."}
      </p>
    </form>
  );
}
