-- Unique, new and returning patients per month and service category.
-- Export the full history (no date filter): "new" means the patient's first-ever
-- qualifying service happened in that month, so the query needs all past months to know it.
-- category = 'all' rows count each patient once across every service; don't add up the other rows.
WITH svc AS (
  SELECT
    s.id                                               AS service_id,
    pi."user_id"                                       AS patient_id,
    date_trunc('month', v."scheduledTime")::date       AS month,
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
  SELECT svc.*, (f.first_month = svc.month) AS is_new
  FROM svc
  JOIN first_seen f USING (patient_id)
)
SELECT
  to_char(month, 'YYYY-MM')                                   AS month,
  category,
  COUNT(DISTINCT patient_id)                                  AS unique_patients,
  COUNT(DISTINCT CASE WHEN is_new THEN patient_id END)        AS new_patients,
  COUNT(DISTINCT CASE WHEN NOT is_new THEN patient_id END)    AS returning_patients,
  COUNT(DISTINCT service_id)                                  AS services
FROM tagged
GROUP BY month, category

UNION ALL

SELECT
  to_char(month, 'YYYY-MM'),
  'all',
  COUNT(DISTINCT patient_id),
  COUNT(DISTINCT CASE WHEN is_new THEN patient_id END),
  COUNT(DISTINCT CASE WHEN NOT is_new THEN patient_id END),
  COUNT(DISTINCT service_id)
FROM tagged
GROUP BY month

ORDER BY 1, 2;
