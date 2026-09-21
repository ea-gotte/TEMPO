-- Fase 24: baja el tamaño máximo por certificado PDF de 10 MB a 2 MB.
-- Motivo: el plan gratuito de Supabase da 1 GB de Storage en total (y 5 GB de
-- transferencia al mes); con ~100 personas y varios certificados cada una,
-- 10 MB por archivo podía llenarlo con unos pocos cientos de escaneos.
-- El límite lo hace cumplir el propio bucket, no solo la app.
update storage.buckets
   set file_size_limit = 2097152 -- 2 MB
 where id = 'certificados';
