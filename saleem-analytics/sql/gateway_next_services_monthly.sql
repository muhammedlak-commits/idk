-- Where each gateway provider's new patients went next, for the gateway section of the Providers module (Saleem Performance Lab).
-- Companion to gateway_provider_monthly.sql: same patients, same first visit, same gateway provider, same clock.
-- One row per basis x cohort month x first service x gateway provider x next service.
-- Next service: any real service (started, finished or reviewed) of that category within N days after the first visit,
--   other than the first service itself. Services in the first order at the first visit's own time count too (same visit,
--   as in other_service_90d of the gateway export); anything else has to be after the first visit.
--   The first service's own category counts as a next service when it comes back in a different order (a repeat).
-- A patient only counts in the N-day columns once N days have passed since the first visit.
-- Order counts leave out the accounting/adjustment tags; patient counts don't depend on them.
-- Only independent and dependant patients are counted.
--
-- Columns:
--   basis                 : 'first' = cohorts by the first visit's month; 'created' = by the month the patient record was created
--   cohort_month          : the cohort month (YYYY-MM) for that basis
--   first_service         : category of the first visit (same categories as the orders export)
--   gateway_provider_id   : user id of the provider on the first visit (empty when there is none)
--   gateway_provider_name : that provider's name, or 'No named provider'
--   next_service          : category of the later service; '(any)' = any later service (one such row for every gateway row,
--                           also when nobody went on, so it carries the eligible counts for every gateway)
--   eligible_30d / 90d / 180d : patients of this gateway row whose first visit was at least 30 / 90 / 180 days ago (the same on every next_service row)
--   patients_30d / 90d / 180d : of those, patients with next_service within 30 / 90 / 180 days after the first visit
--   orders_90d            : distinct orders with next_service within 90 days after the first visit, from eligible_90d patients (tagged orders left out)
-- Share of a gateway's patients who went on to a service = patients_Nd / eligible_Nd (worked out in the dashboard).
-- The 'first' and 'created' rows hold the same patients; don't add them up.
-- Export the full history (no date filter), so every patient's first visit is right.
WITH tagged_orders AS (
    SELECT DISTINCT o.id AS order_id
    FROM "public"."Tag" t
    JOIN "public"."EntityTag" et ON et."tag_id" = t.id
    JOIN "public"."Service" s    ON s.id = et."service_id"
    JOIN "public"."Order" o      ON o.id = s."orderId"
    WHERE t."nameInEnglish" IN (
        'Lab Test Rewithdrawal', 'Accounting Adjustment', 'Pioneer Financials',
        'Labs Discounts', '3P Investor Share', 'Salaries'
    )
),
svc AS (          -- every real service of every patient, built once
  SELECT
    s.id                                                         AS service_id,
    o.id                                                         AS order_id,
    pi."user_id"                                                 AS patient_id,
    v."scheduledTime"                                            AS ts,
    s."serviceType"::text                                        AS service_type,
    CASE
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                     THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'                 THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                          AS category,
    CASE s."serviceType"::text
      WHEN 'nursing'       THEN s."nurseUserId"
      WHEN 'physiotherapy' THEN s."physiotherapistUserId"
      ELSE s."doctorUserId"
    END                                                          AS provider_id,
    (o.id IN (SELECT order_id FROM tagged_orders))               AS is_tagged,
    date_trunc('month', pi."createdAt")::date                    AS created_month
  FROM       "public"."Service"     s
  JOIN       "public"."Visit"       v  ON v.id  = s."visitId"
  JOIN       "public"."Order"       o  ON o.id  = s."orderId"
  JOIN       "public"."PatientInfo" pi ON pi.id = s."servicesReceiverPatientId"
  JOIN       "public"."User"        u  ON u.id  = pi."user_id"
  WHERE s."deletedAt" IS NULL
    AND o."deletedAt" IS NULL
    AND v."deletedAt" IS NULL
    AND u."deletedAt" IS NULL      -- PatientInfo has no deletedAt; the User row carries it
    AND s."orderId" IS NOT NULL
    AND s."serviceType"::text != 'package'
    AND v."visitStatus"::text IN ('started', 'finished', 'reviewed')
    AND u."userType" IN ('independent_patient', 'dependant_patient')
),
first_visit AS (  -- each patient's first real visit and its provider (the gateway)
  SELECT DISTINCT ON (patient_id)
    patient_id,
    service_id                                                   AS first_service_id,
    ts                                                           AS first_ts,
    order_id                                                     AS first_order_id,
    category                                                     AS first_service,
    provider_id                                                  AS gateway_id,
    date_trunc('month', ts)::date                                AS first_month,
    created_month,
    (ts <= now() - interval '30 days')                           AS eligible_30d,
    (ts <= now() - interval '90 days')                           AS eligible_90d,
    (ts <= now() - interval '180 days')                          AS eligible_180d
  FROM svc
  ORDER BY patient_id, ts,
           CASE service_type
             WHEN 'doctorVisit'   THEN 1
             WHEN 'nursing'       THEN 2
             WHEN 'physiotherapy' THEN 3
             ELSE 4
           END,
           service_id
),
next_svc AS (    -- per patient and next category: within how many days it first came, and the orders in 90 days
  SELECT
    f.patient_id,
    l.category                                                                              AS next_service,
    bool_or(l.ts <= f.first_ts + interval '30 days')                                        AS in_30d,
    bool_or(l.ts <= f.first_ts + interval '90 days')                                        AS in_90d,
    COUNT(DISTINCT CASE WHEN NOT l.is_tagged AND l.ts <= f.first_ts + interval '90 days'
                        THEN l.order_id END)                                                AS orders_90d
  FROM first_visit f
  JOIN svc l
    ON l.patient_id  = f.patient_id
   AND l.service_id <> f.first_service_id
   AND (l.ts > f.first_ts OR l.order_id = f.first_order_id)
   AND l.ts <= f.first_ts + interval '180 days'
   AND NOT (l.category = f.first_service AND l.order_id = f.first_order_id)   -- a second line of the same service in the first order isn't a next service
  GROUP BY f.patient_id, l.category
),
any_next AS (    -- per patient: any later service within N days, and the orders in 90 days
  SELECT
    f.patient_id,
    bool_or(l.ts <= f.first_ts + interval '30 days')                                        AS in_30d,
    bool_or(l.ts <= f.first_ts + interval '90 days')                                        AS in_90d,
    COUNT(DISTINCT CASE WHEN NOT l.is_tagged AND l.ts <= f.first_ts + interval '90 days'
                        THEN l.order_id END)                                                AS orders_90d
  FROM first_visit f
  JOIN svc l
    ON l.patient_id  = f.patient_id
   AND l.service_id <> f.first_service_id
   AND (l.ts > f.first_ts OR l.order_id = f.first_order_id)
   AND l.ts <= f.first_ts + interval '180 days'
   AND NOT (l.category = f.first_service AND l.order_id = f.first_order_id)
  GROUP BY f.patient_id
),
gateway_size AS ( -- eligible patients per gateway row, repeated on each of its next_service rows
  SELECT c.basis, c.cohort_month, f.first_service, f.gateway_id,
         COUNT(DISTINCT CASE WHEN f.eligible_30d  THEN f.patient_id END) AS eligible_30d,
         COUNT(DISTINCT CASE WHEN f.eligible_90d  THEN f.patient_id END) AS eligible_90d,
         COUNT(DISTINCT CASE WHEN f.eligible_180d THEN f.patient_id END) AS eligible_180d
  FROM first_visit f
  CROSS JOIN LATERAL (VALUES ('first', f.first_month), ('created', f.created_month)) AS c(basis, cohort_month)
  GROUP BY 1, 2, 3, 4
)
SELECT
  c.basis,
  to_char(c.cohort_month, 'YYYY-MM')                                                   AS cohort_month,
  f.first_service,
  f.gateway_id                                                                         AS gateway_provider_id,
  COALESCE(p."name", 'No named provider')                                              AS gateway_provider_name,
  n.next_service,
  MAX(g.eligible_30d)                                                                  AS eligible_30d,
  COUNT(DISTINCT CASE WHEN f.eligible_30d  AND n.in_30d THEN f.patient_id END)         AS patients_30d,
  MAX(g.eligible_90d)                                                                  AS eligible_90d,
  COUNT(DISTINCT CASE WHEN f.eligible_90d  AND n.in_90d THEN f.patient_id END)         AS patients_90d,
  SUM(CASE WHEN f.eligible_90d THEN n.orders_90d ELSE 0 END)                           AS orders_90d,
  MAX(g.eligible_180d)                                                                 AS eligible_180d,
  COUNT(DISTINCT CASE WHEN f.eligible_180d THEN f.patient_id END)                      AS patients_180d
FROM       first_visit f
CROSS JOIN LATERAL (VALUES ('first',   f.first_month),
                           ('created', f.created_month)) AS c(basis, cohort_month)
JOIN       next_svc      n ON n.patient_id = f.patient_id
JOIN       gateway_size  g ON g.basis = c.basis AND g.cohort_month = c.cohort_month
                          AND g.first_service = f.first_service AND g.gateway_id IS NOT DISTINCT FROM f.gateway_id
LEFT JOIN  "public"."User" p ON p.id = f.gateway_id
GROUP BY 1, 2, 3, 4, 5, 6
UNION ALL
SELECT
  c.basis,
  to_char(c.cohort_month, 'YYYY-MM'),
  f.first_service,
  f.gateway_id,
  COALESCE(p."name", 'No named provider'),
  '(any)',
  COUNT(DISTINCT CASE WHEN f.eligible_30d  THEN f.patient_id END),
  COUNT(DISTINCT CASE WHEN f.eligible_30d  AND a.in_30d THEN f.patient_id END),
  COUNT(DISTINCT CASE WHEN f.eligible_90d  THEN f.patient_id END),
  COUNT(DISTINCT CASE WHEN f.eligible_90d  AND a.in_90d THEN f.patient_id END),
  SUM(CASE WHEN f.eligible_90d THEN COALESCE(a.orders_90d, 0) ELSE 0 END),
  COUNT(DISTINCT CASE WHEN f.eligible_180d THEN f.patient_id END),
  COUNT(DISTINCT CASE WHEN f.eligible_180d AND a.patient_id IS NOT NULL THEN f.patient_id END)
FROM       first_visit f
CROSS JOIN LATERAL (VALUES ('first',   f.first_month),
                           ('created', f.created_month)) AS c(basis, cohort_month)
LEFT JOIN  any_next      a ON a.patient_id = f.patient_id
LEFT JOIN  "public"."User" p ON p.id = f.gateway_id
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3, 5, 10 DESC, 6;
