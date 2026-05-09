"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/server/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().default("/dashboard"),
});

type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function loginAction(raw: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos." };
  }

  const { email, password, callbackUrl } = parsed.data;

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return { ok: true, redirectTo: callbackUrl };
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === "CredentialsSignin") {
        return { ok: false, error: "Email ou senha incorretos." };
      }
      return { ok: false, error: "Não foi possível entrar. Tente novamente." };
    }
    throw e;
  }
}
