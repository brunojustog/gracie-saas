/**
 * Email sender via Resend.
 *
 * Modo dev sem RESEND_API_KEY: o helper loga o email no console em vez
 * de mandar — assim o desenvolvedor consegue copiar o link de convite
 * sem precisar configurar Resend.
 */
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Gracie Barra Anália Franco <noreply@example.com>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type EmailResult =
  | { ok: true; messageId: string | null; mode: "sent" | "logged" }
  | { ok: false; error: string };

async function send(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  if (!resend) {
    // Modo dev: loga no console pra desenvolvedor copiar
    console.log("\n[email — Resend não configurado, modo log]");
    console.log(`  to:      ${params.to}`);
    console.log(`  subject: ${params.subject}`);
    console.log(`  text:\n${params.text.split("\n").map((l) => `    ${l}`).join("\n")}\n`);
    return { ok: true, messageId: null, mode: "logged" };
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, messageId: result.data?.id ?? null, mode: "sent" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendInviteEmail(params: {
  to: string;
  inviterName: string;
  tenantName: string;
  inviteUrl: string;
}): Promise<EmailResult> {
  const { to, inviterName, tenantName, inviteUrl } = params;
  const subject = `Convite para acessar ${tenantName}`;
  const text = `Olá!

${inviterName} convidou você para participar do sistema da ${tenantName}.

Para criar sua senha e ativar seu acesso, clique no link abaixo:

${inviteUrl}

Esse link expira em 7 dias. Se você não esperava esse convite, ignore este email.

— Equipe ${tenantName}`;

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;color:#111;line-height:1.5">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;padding:32px">
      <h1 style="margin:0 0 16px;font-size:20px">Convite para ${escapeHtml(tenantName)}</h1>
      <p>Olá!</p>
      <p><strong>${escapeHtml(inviterName)}</strong> convidou você para participar do sistema da <strong>${escapeHtml(tenantName)}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#DB2777;color:#fff;text-decoration:none;border-radius:6px;font-weight:500">
          Aceitar convite
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">Esse link expira em 7 dias. Se você não esperava esse convite, ignore este email.</p>
    </div>
  </body>
</html>`;

  return send({ to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const emailMode: "sent" | "logged" = resend ? "sent" : "logged";
