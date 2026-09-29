-- Daily orders per provider for the Saleem Performance Lab (Providers tab and Service links).
-- One row per day x service category x visit status x provider, dated by scheduled time.
-- Covers the services that have a named provider: doctor visits (and surgeries booked as doctor visits),
-- nursing and physiotherapy. Categories follow the same rules as the orders export, so the top filter matches.
-- Services with no provider assigned yet come out as provider_name = 'Unassigned'.
--
-- SPECIALTY: the doctor's specialty comes from DoctorInfo.speciality (joined on DoctorInfo.userId = the doctor's user id).
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
    date_trunc('day', v."scheduledTime")::date                   AS day,
    CASE
      WHEN s."serviceType"::text IN ('doctorVisit', 'booking')
           AND s."finalPriceAmount" >= 500000                     THEN 'surgeries'
      WHEN s."serviceType"::text = 'physiotherapy'
           AND pi."howDidTheyHearAboutUs" = 'b2b'                 THEN 'physiotherapy (b2b)'
      ELSE s."serviceType"::text
    END                                                          AS service_category,
    v."visitStatus"::text                                        AS visit_status,
    CASE s."serviceType"::text
      WHEN 'nursing'       THEN s."nurseUserId"
      WHEN 'physiotherapy' THEN s."physiotherapistUserId"
      ELSE s."doctorUserId"
    END                                                          AS provider_id,
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
    AND s."serviceType"::text IN ('doctorVisit', 'nursing', 'physiotherapy')
    AND v."visitStatus"::text IN ('started', 'finished', 'reviewed', 'cancelled')
    AND v."scheduledTime" < date_trunc('day', now()) + interval '1 day'
)
SELECT
  to_char(b.day, 'YYYY-MM-DD')                                   AS day,
  b.service_category,
  b.visit_status,
  b.provider_id,
  COALESCE(p."name", 'Unassigned')                               AS provider_name,
  sp.specialty                                                   AS specialty,   -- DoctorInfo.speciality; empty for nurses and physiotherapists
  COUNT(DISTINCT b.service_id)                                   AS services_delivered,
  COUNT(DISTINCT CASE WHEN NOT b.is_tagged THEN b.order_id END)  AS distinct_orders,
  COUNT(DISTINCT b.patient_id)                                   AS distinct_patients
FROM      base b
LEFT JOIN "public"."User" p ON p.id = b.provider_id
LEFT JOIN LATERAL (SELECT di."speciality"::text AS specialty FROM "public"."DoctorInfo" di
                   WHERE di."userId" = b.provider_id LIMIT 1) sp ON TRUE   -- one row per doctor, so counts never double
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY 1, 2, 3, 5;
