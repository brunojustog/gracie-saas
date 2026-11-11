"use client";

/**
 * v1.3-A: painel da cobrança automática no cartão (Cielo) de uma matrícula.
 * Gera o link de cadastro do cartão, mostra status, sincroniza e desativa.
 */
import { format } from "date-fns";
import { Copy, MessageCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { createCieloCardLink, deactivateCieloRecurrence, syncCieloEnrollment } from "./actions";

export type CieloRow = {
  id: string;
  status: string;
  lead: { name: string; phone: string | null };
  cieloRecurrentPaymentId: string | null;
  cieloRecurrenceStatus: number | null;
  cieloCardMasked: string | null;
  cieloCardBrand: string | null;
  cieloLastError: string | null;
  cieloCardLinkExpiresAt: Date | string | null;
};

const STATUS_LABEL: Record<number, string> = {
  1: "ativa",
  2: "finalizada",
  3: "desativada",
  4: "desativada (tentativas esgotadas)",
  5: "desativada (cartão vencido)",
  8: "desativada (bloqueio)",
};

export function cieloBadge(r: CieloRow): { label: string; tone: string } | null {
  if (r.cieloRecurrentPaymentId && r.cieloRecurrenceStatus === 1) {
    return r.cieloLastError
      ? { label: "cartão · recusado", tone: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" }
      : { label: "cartão automático", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" };
  }
  if (r.cieloRecurrentPaymentId && r.cieloRecurrenceStatus != null) {
    return { label: `cartão ${STATUS_LABEL[r.cieloRecurrenceStatus] ?? "inativo"}`, tone: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200" };
  }
  if (r.cieloCardLinkExpiresAt && new Date(r.cieloCardLinkExpiresAt) > new Date()) {
    return { label: "link do cartão enviado", tone: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" };
  }
  return null;
}

function toWhatsappPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

export function CieloDialog({
  target,
  onClose,
  canManage,
}: {
  target: CieloRow | null;
  onClose: () => void;
  canManage: boolean;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <CieloBody key={target.id} target={target} onClose={onClose} canManage={canManage} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CieloBody({ target, onClose, canManage }: { target: CieloRow; onClose: () => void; canManage: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = Boolean(target.cieloRecurrentPaymentId && target.cieloRecurrenceStatus === 1);

  const handleLink = () => {
    startTransition(async () => {
      const r = await createCieloCardLink({ enrollmentId: target.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLink(r.url);
      router.refresh();
    });
  };

  const handleSync = () => {
    startTransition(async () => {
      const r = await syncCieloEnrollment({ enrollmentId: target.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.paid > 0 ? `${r.paid} mensalidade(s) baixada(s)` : "Sincronizado — nada novo");
      router.refresh();
    });
  };

  const handleDeactivate = () => {
    if (!window.confirm(`Desativar a cobrança automática de ${target.lead.name}? A Cielo para de cobrar o cartão.`)) return;
    startTransition(async () => {
      const r = await deactivateCieloRecurrence({ enrollmentId: target.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Cobrança automática desativada");
      onClose();
      router.refresh();
    });
  };

  const waPhone = toWhatsappPhone(target.lead.phone);
  const waText = link
    ? `Olá, ${target.lead.name.split(" ")[0]}! Segue o link para cadastrar seu cartão e ativar o pagamento automático da mensalidade: ${link}`
    : "";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cobrança automática no cartão</DialogTitle>
        <DialogDescription>{target.lead.name}</DialogDescription>
      </DialogHeader>

      <div className="space-y-3 text-sm">
        {target.cieloRecurrentPaymentId ? (
          <div className="space-y-1 rounded-md border p-3">
            <div>
              <span className="text-muted-foreground">Status na Cielo: </span>
              <b>{target.cieloRecurrenceStatus != null ? STATUS_LABEL[target.cieloRecurrenceStatus] ?? target.cieloRecurrenceStatus : "—"}</b>
            </div>
            {target.cieloCardMasked ? (
              <div>
                <span className="text-muted-foreground">Cartão: </span>
                {target.cieloCardBrand} {target.cieloCardMasked}
              </div>
            ) : null}
            {target.cieloLastError ? <p className="text-xs text-destructive">{target.cieloLastError}</p> : null}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Gere o link e envie ao aluno. Ele cadastra o cartão uma vez e a mensalidade passa a ser
            cobrada todo mês automaticamente, com baixa automática aqui no sistema.
          </p>
        )}

        {target.status === "ACTIVE" ? (
          <Button variant={active ? "outline" : "default"} size="sm" onClick={handleLink} disabled={pending} className="w-full">
            {active ? "Gerar link para trocar o cartão" : "Gerar link de cadastro do cartão"}
          </Button>
        ) : null}

        {link ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={link} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar link"
                onClick={() =>
                  navigator.clipboard.writeText(link).then(
                    () => toast.success("Link copiado"),
                    () => toast.error("Não foi possível copiar"),
                  )
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {waPhone ? (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
              </a>
            ) : null}
            <p className="text-[11px] text-muted-foreground">Válido por 7 dias. Gerar outro invalida este.</p>
          </div>
        ) : target.cieloCardLinkExpiresAt && new Date(target.cieloCardLinkExpiresAt) > new Date() ? (
          <p className="text-[11px] text-muted-foreground">
            Há um link ativo até {format(new Date(target.cieloCardLinkExpiresAt), "dd/MM/yyyy")}. Por
            segurança ele não é exibido de novo — gere outro se precisar reenviar.
          </p>
        ) : null}

        {target.cieloRecurrentPaymentId ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={pending} className="flex-1">
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sincronizar com a Cielo
            </Button>
            {active && canManage ? (
              <Button variant="outline" size="sm" onClick={handleDeactivate} disabled={pending} className="flex-1 text-destructive">
                Desativar cobrança
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
