-- Daily orders export for the Saleem Performance Lab, dated by scheduled time (the day the visit is scheduled for).
-- One row per day x service category x visit status, in the layout the Data tab expects.
-- Visits still only scheduled are left out, so future days don’t appear; cancelled ones are kept so the dashboard can show cancellation rates.
-- Order counts leave out the accounting/adjustment tags; services and patients don't depend on them.
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
base AS (
  SELECT
    date_trunc('day', v."scheduledTime")::date                                                   AS day,
    CASE
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                     THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'                 THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                          AS service_category,
    v."visitStatus"::text                                        AS visit_status,
    s.id                                                         AS service_id,
    o.id                                                         AS order_id,
    pi."user_id"                                                 AS patient_id,
    (o.id IN (SELECT order_id FROM tagged_orders))               AS is_tagged
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
    AND v."visitStatus"::text IN ('started', 'finished', 'reviewed', 'cancelled')
    AND v."scheduledTime" < date_trunc('day', now()) + interval '1 day'
)
SELECT
  to_char(day, 'YYYY-MM-DD')                                   AS day,
  service_category,
  visit_status,
  COUNT(DISTINCT service_id)                                   AS services_delivered,
  COUNT(DISTINCT CASE WHEN NOT is_tagged THEN order_id END)    AS distinct_orders,
  COUNT(DISTINCT patient_id)                                   AS distinct_patients
FROM base
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
