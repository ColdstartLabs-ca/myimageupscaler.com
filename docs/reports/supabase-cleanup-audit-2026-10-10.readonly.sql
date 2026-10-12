-- Supabase quota audit: SELECT-only, aggregate-only queries.
-- Run only after verifying project xqysaylskffsfwunczbd (myimageupscaler.com).
-- now()-based results advance; the report retains each observation time.
-- No DELETE, VACUUM, UPDATE, DDL, or read-only override is included.

SELECT now() AS observed_at,
       pg_database_size(current_database()) AS primary_database_bytes,
       (SELECT sum(pg_database_size(datname)) FROM pg_database) AS cluster_database_bytes,
       current_setting('default_transaction_read_only') AS default_transaction_read_only;

SELECT bucket_id, count(*) AS objects,
       sum(coalesce((metadata->>'size')::bigint,0)) AS bytes
FROM storage.objects
GROUP BY bucket_id ORDER BY bytes DESC;

WITH candidates AS (
  SELECT o.id, o.name, coalesce((o.metadata->>'size')::bigint,0) AS bytes,
    EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path=o.name) AS gallery_reference,
    EXISTS (SELECT 1 FROM public.processing_credit_reservations r
            WHERE r.input_storage_path=o.name
              AND coalesce(r.status,'') NOT IN ('completed','refunded')) AS nonterminal_reservation_reference,
    EXISTS (SELECT 1 FROM public.processing_jobs j
            WHERE (j.input_image_path=o.name OR j.input_image_path LIKE '%/upscale-inputs/'||o.name||'%')
              AND coalesce(j.status,'') NOT IN ('completed','failed','cancelled')) AS nonterminal_job_reference,
    EXISTS (SELECT 1 FROM public.processing_credit_reservations r
            WHERE r.output_url LIKE '%/upscale-inputs/'||o.name||'%') AS reservation_output_reference,
    EXISTS (SELECT 1 FROM public.processing_jobs j
            WHERE j.output_image_path=o.name OR j.output_image_path LIKE '%/upscale-inputs/'||o.name||'%') AS job_output_reference
  FROM storage.objects o
  WHERE o.bucket_id='upscale-inputs'
    AND o.created_at < now()-interval '7 days'
    AND o.updated_at < now()-interval '7 days'
    AND o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$'
)
SELECT now() AS observed_at, gallery_reference, nonterminal_reservation_reference,
       nonterminal_job_reference,reservation_output_reference,job_output_reference,
       count(*) AS files,sum(bytes) AS bytes
FROM candidates GROUP BY 2,3,4,5,6;

SELECT now() AS observed_at,
       count(*) AS objects,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path=o.name)) AS referenced_objects,
       sum(coalesce((metadata->>'size')::bigint,0)) FILTER
         (WHERE EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path=o.name)) AS referenced_bytes,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path=o.name)) AS unreferenced_objects,
       sum(coalesce((metadata->>'size')::bigint,0)) FILTER
         (WHERE NOT EXISTS (SELECT 1 FROM public.saved_images s WHERE s.storage_path=o.name)) AS unreferenced_bytes
FROM storage.objects o WHERE o.bucket_id='saved-images';

SELECT schemaname,relname,pg_relation_size(relid) AS heap_bytes,
       pg_indexes_size(relid) AS index_bytes,pg_total_relation_size(relid) AS total_bytes,
       n_live_tup AS estimated_live_rows,n_dead_tup AS estimated_dead_rows,
       last_autovacuum,last_autoanalyze
FROM pg_stat_user_tables ORDER BY total_bytes DESC LIMIT 20;

SELECT status,count(*) AS exact_rows,
       count(*) FILTER (WHERE updated_at<now()-interval '30 days') AS older_30d_updated_rows,
       count(*) FILTER (WHERE created_at<now()-interval '30 days') AS older_30d_created_rows
FROM public.email_lifecycle_queue GROUP BY status;

SELECT conrelid::regclass::text AS source_table,confrelid::regclass::text AS target_table,
       conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype='f'
 AND (conrelid::regclass::text ~ '(email_lifecycle|saved_images)'
      OR confrelid::regclass::text ~ '(email_lifecycle|saved_images)');

SELECT created_at,updated_at,metadata ? 'cleanup_version' AS version_present,
       metadata ? 'cleanup_cursor' AS cursor_present
FROM storage.objects
WHERE bucket_id='upscale-inputs' AND name='_system/gallery-cleanup-state.png';

-- Separate ClickHouse Logs Explorer query; NOT PostgreSQL.
-- Explicit log bounds used: 2026-10-09T17:47:00Z .. 2026-10-10T17:47:00Z.
-- SELECT if(timestamp < toDateTime64('2026-10-09 22:43:00',3,'UTC'),
--           'before_notice','after_notice') AS window,
--        CASE WHEN startsWith(log_attributes['request.path'],'/rest/') THEN 'rest'
--             WHEN startsWith(log_attributes['request.path'],'/auth/') THEN 'auth'
--             WHEN startsWith(log_attributes['request.path'],'/storage/') THEN 'storage'
--             ELSE 'other' END AS service,
--        log_attributes['response.status_code'] AS http_status,count(*) AS requests
-- FROM logs WHERE source='edge_logs'
-- GROUP BY window,service,http_status ORDER BY window,service,http_status;
