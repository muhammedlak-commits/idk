-- Gateway providers per month, for the Providers and Service links modules.
-- For every new patient: which provider served their first-ever real visit (the gateway), and how much
-- the patient kept ordering after it. One row per basis x cohort month x first service x gateway provider.
-- First visit: the patient's earliest real service (started, finished or reviewed) by scheduled time, in any service.
--   Services at the same time: doctor visit first, then nursing, then physiotherapy, then the rest, then the lowest service id.
-- Gateway provider: the provider on that first service, picked like the providers export (nurse for nursing,
--   physiotherapist for physiotherapy, doctor for everything else). No provider -> 'No named provider', empty id.
-- The retention clock always starts at the first visit: "within N days" = after the first visit's time and at most
--   N days after it. A patient only counts in the N-day columns once N days have passed since the first visit.
--   Other services in the first order count for other_service_90d even at the first visit's own time (same visit),
--   as in the provider follow-on export; returns and repeat orders always need a different order.
-- Order counts leave out the accounting/adjustment tags; patient counts don't depend on them.
-- Only independent and dependant patients are counted.
--
-- Columns:
--   basis                 : 'first' = cohorts by the first visit's month; 'created' = cohorts by the month the patient record (PatientInfo.createdAt) was created, same patients, same gateway, same clock
--   cohort_month          : the cohort month (YYYY-MM) for that basis
--   first_service         : category of the first visit (same categories as the orders export)
--   gateway_provider_id   : user id of the provider on the first visit (empty when there is none)
--   gateway_provider_name : that provider's name, or 'No named provider'
--   specialty             : the gateway doctor's specialty (empty until the column is filled in, see below)
--   new_patients          : patients whose first visit falls in this row
--   eligible_30d          : of them, patients whose first visit was at least 30 days ago
--   returned_30d          : of eligible_30d, patients with a real service in a different order within 30 days after the first visit
--   eligible_90d          : of new_patients, patients whose first visit was at least 90 days ago
--   returned_90d          : of eligible_90d, patients with a real service in a different order within 90 days after the first visit
--   eligible_180d         : of new_patients, patients whose first visit was at least 180 days ago
--   returned_180d         : of eligible_180d, patients with a real service in a different order within 180 days after the first visit
--   orders_90d            : per eligible_90d patient, distinct orders other than the first one with a real service within 90 days after the first visit, summed (tagged orders left out)
--   other_service_90d     : of eligible_90d, patients with a real service of another category than first_service within 90 days after the first visit (any order; the first order's other services also at the first visit's time)
--   same_provider_90d     : of eligible_90d, patients with a real service by the gateway provider in a different order within 90 days after the first visit; 0 without a named provider
-- Retention rate = returned_Nd / eligible_Nd (worked out in the dashboard). The 'first' and 'created' rows hold the same patients; don't add them up.
--
-- SPECIALTY: the specialty column isn't in the schema notes yet. Until it is filled in below, specialty
-- comes out empty and the dashboard only shows providers. To find it, run:
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND (column_name ILIKE '%special%' OR table_name ILIKE '%special%')
--   ORDER BY 1, 2;
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
after_first AS (  -- per patient, what followed in the 180 days after the first visit
                  -- (plus the first order's other services at the first visit's time, used only by other_service_90d:
                  --  every other column needs a different order, and those are always later than the first visit)
  SELECT
    f.patient_id,
    bool_or(l.order_id <> f.first_order_id AND l.ts <= f.first_ts + interval '30 days')        AS returned_30d,
    bool_or(l.order_id <> f.first_order_id AND l.ts <= f.first_ts + interval '90 days')        AS returned_90d,
    bool_or(l.order_id <> f.first_order_id)                                                     AS returned_180d,
    COUNT(DISTINCT CASE WHEN l.order_id <> f.first_order_id AND NOT l.is_tagged
                         AND l.ts <= f.first_ts + interval '90 days' THEN l.order_id END)       AS orders_90d,
    bool_or(l.category <> f.first_service AND l.ts <= f.first_ts + interval '90 days')         AS other_service_90d,
    bool_or(l.provider_id = f.gateway_id AND l.order_id <> f.first_order_id
            AND l.ts <= f.first_ts + interval '90 days')                                        AS same_provider_90d
  FROM first_visit f
  JOIN svc l
    ON l.patient_id  = f.patient_id
   AND l.service_id <> f.first_service_id
   AND (l.ts > f.first_ts OR l.order_id = f.first_order_id)
   AND l.ts <= f.first_ts + interval '180 days'
  GROUP BY f.patient_id
)
SELECT
  c.basis,
  to_char(c.cohort_month, 'YYYY-MM')                             AS cohort_month,
  f.first_service,
  f.gateway_id                                                   AS gateway_provider_id,
  COALESCE(p."name", 'No named provider')                        AS gateway_provider_name,
  NULL::text                                                     AS specialty,   -- <- replace NULL::text with the doctor's specialty column
  COUNT(DISTINCT f.patient_id)                                                        AS new_patients,
  COUNT(DISTINCT CASE WHEN f.eligible_30d  THEN f.patient_id END)                     AS eligible_30d,
  COUNT(DISTINCT CASE WHEN f.eligible_30d  AND a.returned_30d  THEN f.patient_id END) AS returned_30d,
  COUNT(DISTINCT CASE WHEN f.eligible_90d  THEN f.patient_id END)                     AS eligible_90d,
  COUNT(DISTINCT CASE WHEN f.eligible_90d  AND a.returned_90d  THEN f.patient_id END) AS returned_90d,
  COUNT(DISTINCT CASE WHEN f.eligible_180d THEN f.patient_id END)                     AS eligible_180d,
  COUNT(DISTINCT CASE WHEN f.eligible_180d AND a.returned_180d THEN f.patient_id END) AS returned_180d,
  SUM(CASE WHEN f.eligible_90d THEN COALESCE(a.orders_90d, 0) ELSE 0 END)             AS orders_90d,
  COUNT(DISTINCT CASE WHEN f.eligible_90d AND a.other_service_90d THEN f.patient_id END) AS other_service_90d,
  COUNT(DISTINCT CASE WHEN f.eligible_90d AND a.same_provider_90d THEN f.patient_id END) AS same_provider_90d
FROM       first_visit f
CROSS JOIN LATERAL (VALUES ('first',   f.first_month),         -- two rows per patient, one per basis
                           ('created', f.created_month)) AS c(basis, cohort_month)
LEFT JOIN  after_first    a ON a.patient_id = f.patient_id
LEFT JOIN  "public"."User" p ON p.id = f.gateway_id
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3, 7 DESC, 5;
