-- Follow-on between services, per month, for the Service links module.
-- FOLLOW-UPS: an internist's doctor visit under 100,000 IQD is a follow-up and comes out as its own category, 'followUp'.
-- For every patient's first real visit of service A in a month, did the same patient
-- have a real visit of service B in the 7 / 30 days after it?
--   patients_a   : patients who had service A that month
--   followed_7d  : of them, patients with service B within 7 days after their first A that month
--   followed_30d : the same within 30 days
-- Export the full history with no date filter.
WITH svc AS (
  SELECT
    pi."user_id"                                               AS patient_id,
    v."scheduledTime"                                          AS ts,
    CASE
      WHEN s."serviceType"::text = 'doctorVisit' AND lower(fu.specialty) = 'internist'
           AND s."finalPriceAmount" < 100000                      THEN 'followUp'   -- an internist's follow-up visit
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                   THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'               THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                        AS category
  FROM       "public"."Service"     s
  JOIN       "public"."Visit"       v  ON v.id  = s."visitId"
  JOIN       "public"."Order"       o  ON o.id  = s."orderId"
  JOIN       "public"."PatientInfo" pi ON pi.id = s."servicesReceiverPatientId"
  JOIN       "public"."User"        u  ON u.id  = pi."user_id"
  LEFT JOIN LATERAL (SELECT di."speciality"::text AS specialty FROM "public"."DoctorInfo" di
                     WHERE di."userId" = s."doctorUserId" LIMIT 1) fu ON TRUE   -- for follow-up visits
  WHERE s."deletedAt" IS NULL
    AND o."deletedAt" IS NULL
    AND v."deletedAt" IS NULL
    AND u."deletedAt" IS NULL
    AND s."orderId" IS NOT NULL
    AND s."serviceType"::text != 'package'
    AND v."visitStatus" IN ('started', 'finished', 'reviewed')
    AND u."userType" IN ('independent_patient', 'dependant_patient')
),
a_month AS (      -- each patient's first visit of each service in each month
  SELECT patient_id, category, date_trunc('month', ts)::date AS month, MIN(ts) AS first_ts
  FROM svc
  GROUP BY 1, 2, 3
),
follow AS (       -- the soonest later visit of every other service, within 30 days
  SELECT a.month, a.category AS service_a, b.category AS service_b, a.patient_id,
         MIN(b.ts - a.first_ts) AS gap
  FROM a_month a
  JOIN svc b
    ON b.patient_id = a.patient_id
   AND b.category <> a.category
   AND b.ts >  a.first_ts
   AND b.ts <= a.first_ts + interval '30 days'
  GROUP BY 1, 2, 3, 4
),
cats AS (SELECT DISTINCT category FROM svc)
SELECT
  to_char(a.month, 'YYYY-MM')                                             AS month,
  a.category                                                              AS service_a,
  c.category                                                              AS service_b,
  COUNT(DISTINCT a.patient_id)                                            AS patients_a,
  COUNT(DISTINCT CASE WHEN f.gap <= interval '7 days' THEN f.patient_id END) AS followed_7d,
  COUNT(DISTINCT f.patient_id)                                            AS followed_30d
FROM a_month a
CROSS JOIN cats c
LEFT JOIN follow f
  ON f.month = a.month AND f.service_a = a.category AND f.service_b = c.category AND f.patient_id = a.patient_id
WHERE c.category <> a.category
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
