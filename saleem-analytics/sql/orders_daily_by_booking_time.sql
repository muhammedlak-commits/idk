-- Daily orders export for the Saleem Performance Lab, dated by booking time (the day the order was created).
-- FOLLOW-UPS: an internist's doctor visit under 100,000 IQD is a follow-up and comes out as its own category, 'followUp'.
-- One row per day x service category x visit status, in the layout the Data tab expects.
-- Includes orders still waiting for their visit (status scheduled), since they were booked that day; the Status filter can hide them.
-- Order counts leave out the accounting/adjustment tags; services and patients don't depend on them.
--
-- Columns:
--   services_delivered   : distinct services booked on that day, category and status
--   distinct_orders      : distinct orders among them, not counting orders with an accounting/adjustment tag
--   distinct_patients    : distinct patients (PatientInfo.user_id) among them
--   new_first_services   : services_delivered, counting only services of patients new by first order (below)
--   new_first_orders     : distinct_orders, counting only services of patients new by first order
--   new_first_patients   : distinct_patients, counting only patients new by first order
--   new_created_services : services_delivered, counting only services of patients new by account created (below)
--   new_created_orders   : distinct_orders, counting only services of patients new by account created
--   new_created_patients : distinct_patients, counting only patients new by account created
--   sales_iqd            : sum of finalPriceAmount (IQD) of those services; tagged orders are included, as in all sales totals
--   company_revenue_iqd  : sales_iqd minus all ten provider revenue shares (override amount, else calculated amount);
--                          a service with no share recorded counts in full
--   new_first_sales_iqd, new_first_revenue_iqd, new_created_sales_iqd, new_created_revenue_iqd : the same, for new patients only
--
-- New patients, for the dashboard's All / New / Returning views (returning = total - new, worked out in the dashboard):
--   first_month            : month of the patient's first-ever real visit (started, finished or reviewed) in any service
--   new by first order     : the visit's month is on or before first_month, or the patient has no real visit yet (only scheduled or cancelled)
--   new by account created : the patient record (PatientInfo.createdAt) was created in the visit's month
-- The row's day is the booking day, but both tests use the month the VISIT is scheduled for (not the booking month),
-- the same test as the scheduled-time export, so a service is new or returning in both files alike.
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
    date_trunc('day', o."createdAt")::date                                                   AS day,
    CASE
      WHEN s."serviceType"::text = 'doctorVisit' AND lower(fu.specialty) = 'internist'
           AND s."finalPriceAmount" < 100000                      THEN 'followUp'   -- an internist's follow-up visit
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
    date_trunc('month', v."scheduledTime")::date                 AS visit_month,     -- visit month, not booking month
    date_trunc('month', pi."createdAt")::date                    AS created_month,
    (u."userType" IN ('independent_patient', 'dependant_patient')) AS is_patient,
    COALESCE(s."finalPriceAmount", 0)                            AS sales,
    COALESCE(rs_physio."overrideAmount",  rs_physio."calculatedAmount",  0)
    + COALESCE(rs_doc."overrideAmount",   rs_doc."calculatedAmount",     0)
    + COALESCE(rs_nurse."overrideAmount", rs_nurse."calculatedAmount",   0)
    + COALESCE(rs_rad."overrideAmount",   rs_rad."calculatedAmount",     0)
    + COALESCE(rs_lab."overrideAmount",   rs_lab."calculatedAmount",     0)
    + COALESCE(rs_eye."overrideAmount",   rs_eye."calculatedAmount",     0)
    + COALESCE(rs_amb."overrideAmount",   rs_amb."calculatedAmount",     0)
    + COALESCE(rs_vendor."overrideAmount",rs_vendor."calculatedAmount",  0)
    + COALESCE(rs_b2b."overrideAmount",   rs_b2b."calculatedAmount",     0)
    + COALESCE(rs_booking."overrideAmount",rs_booking."calculatedAmount",0) AS provider_share
  FROM       "public"."Service"     s
  JOIN       "public"."Visit"       v  ON v.id  = s."visitId"
  JOIN       "public"."Order"       o  ON o.id  = s."orderId"
  JOIN       "public"."PatientInfo" pi ON pi.id = s."servicesReceiverPatientId"
  JOIN       "public"."User"        u  ON u.id  = pi."user_id"
  LEFT JOIN LATERAL (SELECT di."speciality"::text AS specialty FROM "public"."DoctorInfo" di
                     WHERE di."userId" = s."doctorUserId" LIMIT 1) fu ON TRUE   -- for follow-up visits
  LEFT JOIN  "public"."RevenueShare" rs_physio  ON rs_physio.id  = s."physiotherapistRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_doc     ON rs_doc.id     = s."doctorRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_nurse   ON rs_nurse.id   = s."nurseRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_rad     ON rs_rad.id     = s."radiologyTechnicianRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_lab     ON rs_lab.id     = s."labTestTechnicianRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_eye     ON rs_eye.id     = s."eyeExamTechnicianRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_amb     ON rs_amb.id     = s."ambulanceDriverRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_vendor  ON rs_vendor.id  = s."vendorRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_b2b     ON rs_b2b.id     = s."b2bInstitutionRevenueShareId"
  LEFT JOIN  "public"."RevenueShare" rs_booking ON rs_booking.id = s."bookingProviderRevenueShareId"
  WHERE s."deletedAt" IS NULL
    AND o."deletedAt" IS NULL
    AND v."deletedAt" IS NULL
    AND u."deletedAt" IS NULL
    AND s."orderId" IS NOT NULL
    AND s."serviceType"::text != 'package'
    AND v."visitStatus"::text IN ('scheduled', 'started', 'finished', 'reviewed', 'cancelled')
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
  COUNT(DISTINCT CASE WHEN is_new_created THEN patient_id END)                   AS new_created_patients,
  ROUND(SUM(sales))                                                              AS sales_iqd,
  ROUND(SUM(sales - provider_share))                                             AS company_revenue_iqd,
  ROUND(SUM(CASE WHEN is_new_first THEN sales ELSE 0 END))                       AS new_first_sales_iqd,
  ROUND(SUM(CASE WHEN is_new_first THEN sales - provider_share ELSE 0 END))      AS new_first_revenue_iqd,
  ROUND(SUM(CASE WHEN is_new_created THEN sales ELSE 0 END))                     AS new_created_sales_iqd,
  ROUND(SUM(CASE WHEN is_new_created THEN sales - provider_share ELSE 0 END))    AS new_created_revenue_iqd
FROM flagged
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
