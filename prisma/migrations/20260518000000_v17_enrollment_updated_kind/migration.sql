-- v1.1-Q: nova LeadNoteKind para edição de matrícula (campos como valor,
-- plano, modalidade, observações etc. — distinta de CREATED/CANCELED/etc).
ALTER TYPE "LeadNoteKind" ADD VALUE 'ENROLLMENT_UPDATED' AFTER 'ENROLLMENT_CREATED';
