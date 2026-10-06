-- v61 (B2): controle de pagamento da taxa de exame de graduacao.
ALTER TABLE "GraduationExam" ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GraduationExam" ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod";
ALTER TABLE "GraduationExam" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- v61 (B3): promocao de indicacao no pacote particular (aluno nao paga; professor recebe fixo).
ALTER TABLE "PrivatePackage" ADD COLUMN IF NOT EXISTS "referralPromo" BOOLEAN NOT NULL DEFAULT false;
