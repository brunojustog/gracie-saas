"use client";

import { Camera, User, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { removeMyProfessorPhoto, uploadMyProfessorPhoto } from "../actions";

// v1.2-AW: downscale no client (mesma tecnica do editor de professores).
async function downscaleImg(file: File, maxDim = 800, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ProfessorPerfilView({
  professorId,
  name,
  email,
  hasPhoto: initialHasPhoto,
  isOwner,
  tenantName,
}: {
  professorId: string;
  name: string;
  email: string;
  hasPhoto: boolean;
  isOwner: boolean;
  tenantName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [hasPhoto, setHasPhoto] = useState(initialHasPhoto);
  const [ver, setVer] = useState(0);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Selecione uma imagem");
    startTransition(async () => {
      const blob = await downscaleImg(file);
      if (blob.size > 4 * 1024 * 1024) return void toast.error("Imagem grande demais (máx. 4 MB)");
      const fd = new FormData();
      fd.set("photo", new File([blob], "prof.jpg", { type: blob.type || "image/jpeg" }));
      const r = await uploadMyProfessorPhoto(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Foto salva");
      setHasPhoto(true);
      setVer((v) => v + 1);
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const r = await removeMyProfessorPhoto();
      if (!r.ok) return void toast.error(r.error);
      toast.success("Foto removida");
      setHasPhoto(false);
      setVer((v) => v + 1);
      router.refresh();
    });

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          Sua foto aparece no card das suas aulas para os alunos.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="grid h-32 w-32 place-items-center overflow-hidden rounded-full border bg-muted text-muted-foreground hover:bg-accent"
          title={hasPhoto ? "Trocar foto" : "Adicionar foto"}
        >
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/professor/${professorId}/photo?v=${ver}`}
              alt={name}
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-10 w-10" />
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
            <Camera className="mr-1 h-4 w-4" />
            {hasPhoto ? "Trocar foto" : "Adicionar foto"}
          </Button>
          {hasPhoto ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={remove}
              disabled={pending}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Remover
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Nome</dt>
          <dd className="font-medium">{name}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="font-medium">{email}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Academia</dt>
          <dd className="font-medium">{tenantName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Perfil</dt>
          <dd className="font-medium">{isOwner ? "Gestor" : "Professor"}</dd>
        </div>
      </dl>
    </main>
  );
}
