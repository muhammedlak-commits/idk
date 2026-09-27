-- Follow-on per provider and month, for Service links › Specialties & providers (Saleem Performance Lab).
-- For each provider and month: of the patients they served, how many went on to each service
-- (their own included) within 7 and 30 days. Shows which doctors, nurses and physiotherapists lead
-- patients on to lab tests, doctor visits and the rest.
-- Covers the services that have a named provider: doctor visits (and surgeries booked as doctor visits),
-- nursing and physiotherapy. Categories follow the same rules as the orders export, so the top filter matches.
-- Services with no provider assigned yet come out as provider_name = 'Unassigned'.
-- Real visits only (started, finished or reviewed), independent and dependant patients only.
--
-- Anchor    : for each provider, provider service, month and patient, the patient's earliest real visit
--             with that provider that month (month = the anchor's scheduled time)
-- Follow-on : another real service of the same patient, of any category, by any provider or none, that is
--             in the same order as the anchor and of a different category (at any time), or
--             scheduled after the anchor and no more than 7 (or 30) days after it
--
-- Columns:
--   month             : month of the anchor visit's scheduled time (YYYY-MM)
--   provider_service  : category of the provider's service (doctorVisit, surgeries, nursing, physiotherapy, physiotherapy (b2b))
--   provider_id       : User id of the doctor, nurse or physiotherapist (empty when unassigned)
--   provider_name     : the provider's name, or 'Unassigned'
--   specialty         : the doctor's specialty (empty until filled in, see below)
--   target_service    : category of the follow-on service; '(any)' = a follow-on of any category
--   patients          : distinct patients the provider served that month in provider_service
--   eligible_7d       : of patients, those whose anchor was at least 7 days ago (the 7-day window has fully passed)
--   followed_7d       : of eligible_7d, patients with a target_service follow-on within 7 days
--   eligible_30d      : of patients, those whose anchor was at least 30 days ago
--   followed_30d      : of eligible_30d, patients with a target_service follow-on within 30 days
--   target_orders_30d : distinct orders of those 30-day follow-ons (eligible_30d patients only), not counting orders with an accounting/adjustment tag
-- patients, eligible_7d and eligible_30d are per provider-month and repeat on every row of it; don't add them up.
-- Every provider-month has a '(any)' row; rows of a single target service are left out when nobody followed on.
-- Export the full history (no date filter).
--
-- SPECIALTY: the specialty column isn't in the schema notes yet. Until it is filled in below, specialty
-- comes out empty and the dashboard only shows providers. To find it, run:
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND (column_name ILIKE '%special%' OR table_name ILIKE '%special%')
--   ORDER BY 1, 2;
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
svc AS (       -- one slim row per real service of a patient, every category (built once, reused below)
  SELECT
    s.id                                                         AS service_id,
    o.id                                                         AS order_id,
    pi."user_id"                                                 AS patient_id,
    v."scheduledTime"                                            AS ts,
    floor(extract(epoch FROM v."scheduledTime") / (31 * 86400))::int AS slot,   -- 31-day slot: a visit up to 30 days later is in the same slot or the next
    CASE
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                     THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'                 THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                          AS category,
    (s."serviceType"::text IN ('doctorVisit', 'nursing', 'physiotherapy')) AS is_provider_service,
    CASE s."serviceType"::text                                   -- only used on provider services
      WHEN 'nursing'       THEN s."nurseUserId"
      WHEN 'physiotherapy' THEN s."physiotherapistUserId"
      ELSE s."doctorUserId"
    END                                                          AS provider_id,
    (o.id IN (SELECT order_id FROM tagged_orders))               AS is_tagged
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
    AND v."visitStatus" IN ('started', 'finished', 'reviewed')
    AND u."userType" IN ('independent_patient', 'dependant_patient')
),
anchors AS (   -- each patient's earliest real visit with each provider, per month and provider service
  SELECT DISTINCT ON (date_trunc('month', ts), category, provider_id, patient_id)
    date_trunc('month', ts)::date                                AS month,
    category                                                     AS provider_service,
    provider_id,
    patient_id,
    service_id,
    order_id,
    ts,
    slot,
    (ts <= now() - interval '7 days')                            AS eligible_7d,
    (ts <= now() - interval '30 days')                           AS eligible_30d
  FROM svc
  WHERE is_provider_service
  ORDER BY date_trunc('month', ts), category, provider_id, patient_id, ts, service_id
),
links AS (     -- each anchor with every follow-on within 30 days, in three parts; a follow-on found by both of the
               -- first two parts comes out twice, which the COUNT(DISTINCT ...) below doesn't mind
  -- same order as the anchor and another category, at any time
  SELECT a.month, a.provider_service, a.provider_id, a.patient_id, a.eligible_7d, a.eligible_30d,
         t.category AS target_category, t.order_id AS target_order_id, t.is_tagged AS target_is_tagged,
         TRUE AS within_7d
  FROM anchors a
  JOIN svc     t ON  t.patient_id = a.patient_id
                 AND t.order_id   = a.order_id
                 AND t.category  <> a.provider_service
  UNION ALL
  -- scheduled after the anchor, no more than 30 days after it (looked up in the anchor's slot and the next only)
  SELECT a.month, a.provider_service, a.provider_id, a.patient_id, a.eligible_7d, a.eligible_30d,
         t.category, t.order_id, t.is_tagged,
         (t.ts <= a.ts + interval '7 days')
  FROM anchors a
  CROSS JOIN (VALUES (0), (1)) AS next_slot(n)
  JOIN svc     t ON  t.patient_id = a.patient_id
                 AND t.slot       = a.slot + next_slot.n
                 AND t.ts         > a.ts
                 AND t.ts        <= a.ts + interval '30 days'
  UNION ALL
  -- every anchor once more with empty follow-on columns, so a provider-month with no follow-on still gets its '(any)' row
  SELECT a.month, a.provider_service, a.provider_id, a.patient_id, a.eligible_7d, a.eligible_30d,
         NULL, NULL, NULL,
         NULL
  FROM anchors a
),
counts AS (    -- one '(any)' row per provider-month, plus one row per provider-month and target service
  SELECT
    month,
    provider_service,
    provider_id,
    CASE WHEN GROUPING(target_category) = 1 THEN '(any)' ELSE target_category END      AS target_service,
    COUNT(DISTINCT patient_id)                                                           AS patients,
    COUNT(DISTINCT CASE WHEN eligible_7d THEN patient_id END)                            AS eligible_7d,
    COUNT(DISTINCT CASE WHEN eligible_7d AND within_7d THEN patient_id END)              AS followed_7d,
    COUNT(DISTINCT CASE WHEN eligible_30d THEN patient_id END)                           AS eligible_30d,
    COUNT(DISTINCT CASE WHEN eligible_30d AND target_category IS NOT NULL THEN patient_id END) AS followed_30d,
    COUNT(DISTINCT CASE WHEN eligible_30d AND NOT target_is_tagged THEN target_order_id END)   AS target_orders_30d
  FROM links
  GROUP BY GROUPING SETS (
    (month, provider_service, provider_id),                    -- '(any)'
    (month, provider_service, provider_id, target_category)    -- per target service
  )
)
SELECT
  to_char(c.month, 'YYYY-MM')                                    AS month,
  c.provider_service,
  c.provider_id,
  COALESCE(p."name", 'Unassigned')                               AS provider_name,
  NULL::text                                                     AS specialty,   -- <- replace NULL::text with the doctor's specialty column
  c.target_service,
  MAX(CASE WHEN c.target_service = '(any)' THEN c.patients     END) OVER pm AS patients,       -- taken from the '(any)' row
  MAX(CASE WHEN c.target_service = '(any)' THEN c.eligible_7d  END) OVER pm AS eligible_7d,
  c.followed_7d,
  MAX(CASE WHEN c.target_service = '(any)' THEN c.eligible_30d END) OVER pm AS eligible_30d,
  c.followed_30d,
  c.target_orders_30d
FROM      counts c
LEFT JOIN "public"."User" p ON p.id = c.provider_id
WHERE c.target_service = '(any)'                                 -- always kept
   OR c.followed_7d  > 0                                         -- target rows only when someone followed on
   OR c.followed_30d > 0                                         -- (this also drops the group of the anchors' empty rows)
WINDOW pm AS (PARTITION BY c.month, c.provider_service, c.provider_id)
ORDER BY 1, 2, 4, 3, (c.target_service <> '(any)'), 6;
