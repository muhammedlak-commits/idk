-- Unique, new and returning patients per month and service category.
-- Export the full history (no date filter), so "new" is right for every month.
-- Two definitions of "new", chosen in the dashboard's filter bar:
--   new_patients     : the patient's first-ever real visit with Saleem was in this month
--   new_by_created   : the patient record (PatientInfo) was created in this month
-- accounts_created (only on category = 'all' rows): patient records created that month,
--   whether or not they have had a visit yet.
-- category = 'all' rows count each patient once across every service; don't add up the other rows.
WITH svc AS (
  SELECT
    s.id                                               AS service_id,
    pi."user_id"                                       AS patient_id,
    date_trunc('month', v."scheduledTime")::date       AS month,
    date_trunc('month', pi."createdAt")::date          AS created_month,
    CASE
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                        THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'                    THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                AS category
  FROM       "public"."Service"     s
  JOIN       "public"."Visit"       v  ON v.id  = s."visitId"
  JOIN       "public"."Order"       o  ON o.id  = s."orderId"
  JOIN       "public"."PatientInfo" pi ON pi.id = s."servicesReceiverPatientId"
  JOIN       "public"."User"        u  ON u.id  = pi."user_id"
  WHERE s."deletedAt" IS NULL
    AND o."deletedAt" IS NULL
    AND v."deletedAt" IS NULL
    AND u."deletedAt" IS NULL
    AND s."orderId" IS NOT NULL
    AND s."serviceType"::text != 'package'
    AND v."visitStatus" IN ('started', 'finished', 'reviewed')
    AND u."userType" IN ('independent_patient', 'dependant_patient')
),
first_seen AS (
  SELECT patient_id, MIN(month) AS first_month
  FROM svc
  GROUP BY patient_id
),
tagged AS (
  SELECT svc.*, (f.first_month = svc.month) AS is_new, (svc.created_month = svc.month) AS is_new_created
  FROM svc
  JOIN first_seen f USING (patient_id)
),
created AS (
  SELECT date_trunc('month', pi."createdAt")::date AS month, COUNT(DISTINCT pi."user_id") AS accounts_created
  FROM       "public"."PatientInfo" pi
  JOIN       "public"."User"        u  ON u.id = pi."user_id"
  WHERE u."deletedAt" IS NULL      -- PatientInfo has no deletedAt; the User row carries it
    AND u."userType" IN ('independent_patient', 'dependant_patient')
  GROUP BY 1
)
SELECT
  to_char(month, 'YYYY-MM')                                   AS month,
  category,
  COUNT(DISTINCT patient_id)                                  AS unique_patients,
  COUNT(DISTINCT CASE WHEN is_new THEN patient_id END)        AS new_patients,
  COUNT(DISTINCT CASE WHEN NOT is_new THEN patient_id END)    AS returning_patients,
  COUNT(DISTINCT service_id)                                  AS services,
  COUNT(DISTINCT CASE WHEN is_new_created THEN patient_id END) AS new_by_created,
  NULL::bigint                                                AS accounts_created
FROM tagged
GROUP BY month, category

UNION ALL

SELECT
  to_char(t.month, 'YYYY-MM'),
  'all',
  COUNT(DISTINCT t.patient_id),
  COUNT(DISTINCT CASE WHEN t.is_new THEN t.patient_id END),
  COUNT(DISTINCT CASE WHEN NOT t.is_new THEN t.patient_id END),
  COUNT(DISTINCT t.service_id),
  COUNT(DISTINCT CASE WHEN t.is_new_created THEN t.patient_id END),
  MAX(c.accounts_created)
FROM tagged t
LEFT JOIN created c ON c.month = t.month
GROUP BY t.month

ORDER BY 1, 2;
