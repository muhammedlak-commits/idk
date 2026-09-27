-- Daily orders export for the Saleem Performance Lab, dated by scheduled time (the day the visit is scheduled for).
-- One row per day x service category x visit status, in the layout the Data tab expects.
-- Visits still only scheduled are left out, so future days don’t appear; cancelled ones are kept so the dashboard can show cancellation rates.
-- Order counts leave out the accounting/adjustment tags; services and patients don't depend on them.
--
-- Columns:
--   services_delivered   : distinct services on that day, category and status
--   distinct_orders      : distinct orders among them, not counting orders with an accounting/adjustment tag
--   distinct_patients    : distinct patients (PatientInfo.user_id) among them
--   new_first_services   : services_delivered, counting only services of patients new by first order (below)
--   new_first_orders     : distinct_orders, counting only services of patients new by first order
--   new_first_patients   : distinct_patients, counting only patients new by first order
--   new_created_services : services_delivered, counting only services of patients new by account created (below)
--   new_created_orders   : distinct_orders, counting only services of patients new by account created
--   new_created_patients : distinct_patients, counting only patients new by account created
--
-- New patients, for the dashboard's All / New / Returning views (returning = total - new, worked out in the dashboard):
--   first_month            : month of the patient's first-ever real visit (started, finished or reviewed) in any service
--   new by first order     : the visit's month is on or before first_month, or the patient has no real visit yet (only cancelled)
--   new by account created : the patient record (PatientInfo.createdAt) was created in the visit's month
-- Only independent and dependant patients can be new; rows of any other account type stay in returning.
-- Export the full history (no date filter), so first_month is right for every patient.
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
    (o.id IN (SELECT order_id FROM tagged_orders))               AS is_tagged,
    date_trunc('month', v."scheduledTime")::date                 AS visit_month,
    date_trunc('month', pi."createdAt")::date                    AS created_month,
    (u."userType" IN ('independent_patient', 'dependant_patient')) AS is_patient
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
),
first_seen AS (   -- each patient's first real visit month, across every service
  SELECT patient_id, MIN(visit_month) AS first_month
  FROM base
  WHERE is_patient
    AND visit_status IN ('started', 'finished', 'reviewed')
  GROUP BY patient_id
),
flagged AS (
  SELECT
    b.*,
    (b.is_patient AND (f.first_month IS NULL OR b.visit_month <= f.first_month)) AS is_new_first,
    (b.is_patient AND b.created_month = b.visit_month)                           AS is_new_created
  FROM      base b
  LEFT JOIN first_seen f ON f.patient_id = b.patient_id
)
SELECT
  to_char(day, 'YYYY-MM-DD')                                   AS day,
  service_category,
  visit_status,
  COUNT(DISTINCT service_id)                                   AS services_delivered,
  COUNT(DISTINCT CASE WHEN NOT is_tagged THEN order_id END)    AS distinct_orders,
  COUNT(DISTINCT patient_id)                                   AS distinct_patients,
  COUNT(DISTINCT CASE WHEN is_new_first THEN service_id END)                     AS new_first_services,
  COUNT(DISTINCT CASE WHEN is_new_first AND NOT is_tagged THEN order_id END)     AS new_first_orders,
  COUNT(DISTINCT CASE WHEN is_new_first THEN patient_id END)                     AS new_first_patients,
  COUNT(DISTINCT CASE WHEN is_new_created THEN service_id END)                   AS new_created_services,
  COUNT(DISTINCT CASE WHEN is_new_created AND NOT is_tagged THEN order_id END)   AS new_created_orders,
  COUNT(DISTINCT CASE WHEN is_new_created THEN patient_id END)                   AS new_created_patients
FROM flagged
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
