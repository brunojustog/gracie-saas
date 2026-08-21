import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAluno } from "@/server/tenant";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAY_LABEL: Record<string, string> = {
  CREDIT_CARD: "Cartão", PIX: "Pix", BOLETO: "Boleto",
  CASH: "Dinheiro", TRANSFER: "Transferência", OTHER: "Outro",
};

export default async function FinanceiroPage() {
  const { aluno, tenant } = await requireAluno();
  if (!aluno) {
    return (
      <main className="gb-shell" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Acesso não vinculado a um aluno.</p>
      </main>
    );
  }

  const row = await prisma.aluno.findUnique({
    where: { id: aluno.id },
    select: {
      lead: {
        select: {
          enrollment: {
            select: {
              status: true,
              monthlyValue: true,
              nextDueDate: true,
              paymentMethod: true,
              paidInFullUntil: true,
              plan: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const enr = row?.lead.enrollment ?? null;
  const now = new Date();
  const overdue =
    enr?.status === "ACTIVE" && enr.nextDueDate != null && enr.nextDueDate < now &&
    !(enr.paidInFullUntil && enr.paidInFullUntil >= now);

  return (
    <main className="gb-shell">
      <div className="gb-cal-head">
        <Link href="/aluno" className="gb-icon-btn" aria-label="Voltar"><ChevronLeft size={18} /></Link>
        <span className="gb-cal-title">Financeiro</span>
        <span style={{ width: 38 }} />
      </div>

      {!enr ? (
        <div className="gb-empty" style={{ marginTop: 8 }}>
          Nenhuma cobrança configurada na sua matrícula. Fale com a recepção da
          {" "}{tenant.name}.
        </div>
      ) : (
        <>
          <div className="gb-fin-card">
            <div className="lbl">Mensalidade</div>
            <div className="val">{brl(Number(enr.monthlyValue))}</div>
            <div style={{ fontSize: 13, opacity: .9, marginTop: 2 }}>
              {enr.plan?.name ?? "Plano"}
            </div>
          </div>

          <div className="gb-sec">
            <div className="gb-fin-row">
              <span className="k">Situação</span>
              <span style={{ fontWeight: 700, color: overdue ? "var(--red)" : "var(--ok)" }}>
                {overdue ? "Em atraso" : enr.status === "ACTIVE" ? "Em dia" : "Inativa"}
              </span>
            </div>
            {enr.nextDueDate ? (
              <div className="gb-fin-row">
                <span className="k">Próximo vencimento</span>
                <span style={{ fontWeight: 600 }}>
                  {format(enr.nextDueDate, "dd 'de' MMMM", { locale: ptBR })}
                </span>
              </div>
            ) : null}
            {enr.paymentMethod ? (
              <div className="gb-fin-row">
                <span className="k">Forma de pagamento</span>
                <span style={{ fontWeight: 600 }}>{PAY_LABEL[enr.paymentMethod] ?? enr.paymentMethod}</span>
              </div>
            ) : null}
          </div>

          <p style={{ fontSize: 11, color: "var(--muted-2)", textAlign: "center", marginTop: 4 }}>
            Pagamento online chega em breve. Por ora, acerte na recepção.
          </p>
        </>
      )}
    </main>
  );
}
