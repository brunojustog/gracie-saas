import { differenceInYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAlunoFicha } from "@/server/aluno";
import { requireRole } from "@/server/tenant";

import { SizesEditor } from "./sizes-editor";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const GENDER: Record<string, string> = { FEMALE: "Feminino", MALE: "Masculino" };

const PAY_LABEL: Record<string, string> = {
  CREDIT_CARD: "Cartão", PIX: "Pix", BOLETO: "Boleto",
  CASH: "Dinheiro", TRANSFER: "Transferência", OTHER: "Outro",
};

const SALE_PAY: Record<string, string> = {
  PIX: "Pix", DINHEIRO: "Dinheiro", CARTAO_DEBITO: "Cartão débito",
  CARTAO_CREDITO: "Cartão crédito", CORTESIA: "Cortesia", OUTRO: "Outro",
};

const ENR_STATUS: Record<string, string> = {
  ACTIVE: "Ativa", CANCEL_REQUESTED: "Cancelamento solicitado",
  CANCELED: "Cancelada", SUSPENDED: "Suspensa", JUDICIAL: "Jurídico",
};

const beltLabel = (belt: string | null, grau: number | null) =>
  belt ? `${belt}${grau ? ` · ${grau}º grau` : ""}` : "—";

const dt = (d: Date | null | undefined) =>
  d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "—";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export default async function AlunoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { membership } = await requireRole("ADMIN");
  const f = await getAlunoFicha(membership, id);
  if (!f) notFound();

  const age = f.birthDate ? differenceInYears(new Date(), f.birthDate) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-2">
        <Link
          href="/settings/alunos"
          className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground hover:bg-accent"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">Ficha do aluno</h1>
      </div>

      {/* Cabeçalho: foto + nome + faixa + status */}
      <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground">
          {f.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/aluno/${f.id}/avatar`} alt={f.nome} className="h-full w-full object-cover" />
          ) : (
            <User className="h-8 w-8" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{f.nome}</h2>
            {!f.active ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">inativo</span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{beltLabel(f.belt, f.beltDegree)}</p>
          <p className="text-xs text-muted-foreground">
            {f.matricula ? `Matrícula #${f.matricula}` : "sem matrícula"}
            {" · "}
            {f.hasLogin ? (
              <span className="text-emerald-600 dark:text-emerald-400">com login</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">sem login</span>
            )}
          </p>
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList className="w-full">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="frequencia">Frequência</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
        </TabsList>

        {/* ── DADOS ────────────────────────────────────────────────── */}
        <TabsContent value="dados" className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-1 text-sm font-semibold">Dados pessoais</h3>
            <dl className="text-sm">
              <Field label="Nome" value={f.nome} />
              <Field label="Faixa" value={beltLabel(f.belt, f.beltDegree)} />
              <Field label="Sexo" value={f.gender ? GENDER[f.gender] ?? f.gender : "—"} />
              <Field
                label="Nascimento"
                value={f.birthDate ? `${dt(f.birthDate)}${age != null ? ` · ${age} anos` : ""}` : "—"}
              />
              <Field label="Matrícula" value={f.matricula ? `#${f.matricula}` : "—"} />
              <Field label="Cadastro no sistema" value={dt(f.createdAt)} />
              <Field label="Status" value={f.active ? "Ativo" : "Inativo"} />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-1 text-sm font-semibold">Contato</h3>
            <dl className="text-sm">
              <Field label="Telefone" value={f.phone || "—"} />
              <Field label="E-mail / login" value={f.email || "—"} />
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-1 text-sm font-semibold">Vestimenta (graduação)</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Tamanho de kimono e faixa pra facilitar a entrega nas graduações.
            </p>
            <SizesEditor
              alunoId={f.id}
              kimonoSize={f.kimonoSize}
              beltSize={f.beltSize}
            />
          </section>
        </TabsContent>

        {/* ── FREQUÊNCIA ───────────────────────────────────────────── */}
        <TabsContent value="frequencia" className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Cartão de frequência</h3>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Presenças desde a última graduação
              </span>
              <span className="font-medium">
                {f.progress.presencas} / {f.progress.threshold}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${f.progress.pct}%` }} />
            </div>
            {f.nextGrad ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Próxima graduação sugerida: {beltLabel(f.nextGrad.belt, f.nextGrad.beltDegree || null)}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Últimas presenças</h3>
            {f.checkIns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma presença registrada.</p>
            ) : (
              <ul className="divide-y text-sm">
                {f.checkIns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {c.label ?? "Aula"}
                      <span className="text-muted-foreground"> · {c.startTime}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {dt(c.date)} · {c.source === "PROFESSOR" ? "chamada" : "app"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {f.graduations.length > 0 ? (
            <section className="rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Graduações</h3>
              <ul className="divide-y text-sm">
                {f.graduations.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-medium">{beltLabel(g.belt, g.beltDegree || null)}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {dt(g.graduatedAt)}{g.professorName ? ` · ${g.professorName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        {/* ── FINANCEIRO ───────────────────────────────────────────── */}
        <TabsContent value="financeiro" className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Mensalidade</h3>
            {!f.enrollment ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma matrícula/cobrança configurada.
              </p>
            ) : (
              <dl className="text-sm">
                <Field label="Valor" value={brl(f.enrollment.monthlyValue)} />
                <Field label="Plano" value={f.enrollment.planName ?? "—"} />
                <Field
                  label="Situação"
                  value={
                    <span className={f.enrollment.overdue ? "text-red-600 dark:text-red-400" : ""}>
                      {f.enrollment.overdue ? "Em atraso" : ENR_STATUS[f.enrollment.status] ?? f.enrollment.status}
                    </span>
                  }
                />
                <Field label="Próx. vencimento" value={dt(f.enrollment.nextDueDate)} />
                <Field
                  label="Forma"
                  value={f.enrollment.paymentMethod ? PAY_LABEL[f.enrollment.paymentMethod] ?? f.enrollment.paymentMethod : "—"}
                />
                <Field label="Matriculado em" value={dt(f.enrollment.enrolledAt)} />
              </dl>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Histórico de mensalidades</h3>
            {f.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="divide-y text-sm">
                {f.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{dt(p.paidAt)}</span>
                      <span className="text-muted-foreground">
                        {p.method ? ` · ${PAY_LABEL[p.method] ?? p.method}` : ""}
                        {p.confirmedBy ? ` · ${p.confirmedBy}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{brl(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Compras na lojinha</h3>
              {f.sales.length > 0 ? (
                <span className="text-xs text-muted-foreground">Total: {brl(f.totalGasto)}</span>
              ) : null}
            </div>
            {f.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {f.sales.map((s) => (
                  <li key={s.id} className="rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{dt(s.paidAt)}</span>
                      <span className="font-medium">{brl(s.total)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.items.map((i) => `${i.quantity}× ${i.productVariant.product.name}`).join(", ")}
                      {s.paymentMethod ? ` · ${SALE_PAY[s.paymentMethod] ?? s.paymentMethod}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}
