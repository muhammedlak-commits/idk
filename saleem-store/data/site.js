/* Saleem Store — everything about the shop that isn't a product, edited in admin.html.
 *
 * settings  the switches and texts: delivery promise, payment methods, rentals,
 *           ask-a-nurse, product finder, kits, clinics and bulk pricing, refill reminders
 * stores    the partner stores products come from — public details only. Their
 *           commission and contacts are in private/commercial.js, which is never published.
 * kits      ready-made bundles shown in the shop (items: product id, qty, buy/rent/refill)
 * banners   the home-page banners; each is one link. Dates are optional (YYYY-MM-DD).
 */
window.SALEEM_SITE = {
"settings": {
  "publicUrl": "",
  "delivery": {
    "on": true,
    "en": "Delivered in 1–2 days",
    "ar": "التوصيل خلال 1–2 يوم",
    "noteEn": "By our delivery partner, across Baghdad",
    "noteAr": "عن طريق شركة التوصيل، داخل بغداد",
    "feeIqd": null
  },
  "payments": {
    "cod": true,
    "zaincash": true,
    "qicard": true,
    "fastpay": false,
    "card": false
  },
  "rentals": {
    "on": true,
    "minMonths": 1,
    "depositEn": "Refundable deposit, amount confirmed on WhatsApp",
    "depositAr": "تأمين يرجعلك بعد الإرجاع، ومبلغه يتأكد على واتساب",
    "includedEn": "Delivery and pickup",
    "includedAr": "التوصيل والاستلام"
  },
  "nurse": {
    "on": true,
    "whatsapp": "9647710335500"
  },
  "finder": {
    "on": true
  },
  "kits": {
    "on": true
  },
  "clinics": {
    "on": true,
    "bulkOn": true,
    "tiers": [
      {
        "min": 10,
        "pct": 5
      },
      {
        "min": 25,
        "pct": 10
      }
    ]
  },
  "reminders": {
    "on": true,
    "days": 30
  },
  "showStore": true
},
"stores": [

],
"kits": [
  {"id":"bedridden","on":true,"icon":"bed","en":"Bedridden care at home","ar":"رعاية المريض طريح الفراش","blurbEn":"Bed, pressure-relief mattress and the daily essentials for someone who can’t get up.","blurbAr":"سرير ومرتبة ضد التقرحات والمستلزمات اليومية لمريض ما يكدر يكوم.","situations":["bedridden","elderly"],"items":[{"id":66,"qty":1,"mode":"rent"},{"id":67,"qty":1,"mode":"rent"},{"id":53,"qty":2,"mode":"refill"},{"id":56,"qty":1,"mode":"refill"},{"id":57,"qty":1,"mode":"refill"},{"id":69,"qty":1,"mode":"buy"},{"id":68,"qty":1,"mode":"buy"},{"id":201,"qty":1,"mode":"refill"},{"id":210,"qty":1,"mode":"buy"}]},
  {"id":"joint-surgery","on":true,"icon":"brace","en":"After hip or knee surgery","ar":"بعد عملية الورك أو الركبة","blurbEn":"Walking, bathroom and dressing aids for the first weeks home.","blurbAr":"أدوات المشي والحمام واللبس لأول أسابيع بالبيت.","situations":["surgery"],"items":[{"id":2,"qty":1,"mode":"rent"},{"id":177,"qty":1,"mode":"buy"},{"id":174,"qty":1,"mode":"buy"},{"id":179,"qty":1,"mode":"buy"},{"id":180,"qty":1,"mode":"buy"},{"id":80,"qty":1,"mode":"buy"},{"id":31,"qty":1,"mode":"refill"},{"id":33,"qty":1,"mode":"refill"}]},
  {"id":"diabetes","on":true,"icon":"drop","en":"Diabetes monitoring","ar":"متابعة السكري","blurbEn":"Meter, a month of strips and lancets, pen needles and a blood pressure monitor.","blurbAr":"جهاز سكر وشرائح ووخّازات لشهر وإبر أنسولين وجهاز ضغط.","situations":["diabetes","elderly"],"items":[{"id":22,"qty":1,"mode":"buy"},{"id":23,"qty":2,"mode":"refill"},{"id":24,"qty":1,"mode":"refill"},{"id":44,"qty":1,"mode":"refill"},{"id":21,"qty":1,"mode":"buy"},{"id":182,"qty":1,"mode":"buy"}]},
  {"id":"stroke","on":true,"icon":"walk","en":"Home setup after a stroke","ar":"تجهيز البيت بعد الجلطة","blurbEn":"Safer walking, bathing and eating for the months of recovery.","blurbAr":"مشي واستحمام وأكل أأمن خلال أشهر التعافي.","situations":["elderly","bedridden"],"items":[{"id":4,"qty":1,"mode":"buy"},{"id":6,"qty":1,"mode":"rent"},{"id":82,"qty":1,"mode":"buy"},{"id":175,"qty":1,"mode":"buy"},{"id":178,"qty":1,"mode":"buy"},{"id":97,"qty":1,"mode":"buy"},{"id":81,"qty":1,"mode":"buy"},{"id":181,"qty":1,"mode":"buy"},{"id":193,"qty":1,"mode":"buy"}]},
  {"id":"breathing","on":true,"icon":"lungs","en":"Breathing support at home","ar":"دعم التنفس بالبيت","blurbEn":"Oxygen, a nebulizer and the supplies that go with them.","blurbAr":"أوكسجين وجهاز بخار ومستلزماتهم.","situations":["breathing"],"items":[{"id":74,"qty":1,"mode":"rent"},{"id":75,"qty":1,"mode":"refill"},{"id":25,"qty":1,"mode":"buy"},{"id":72,"qty":1,"mode":"rent"},{"id":73,"qty":1,"mode":"refill"},{"id":79,"qty":1,"mode":"buy"}]},
  {"id":"newborn","on":true,"icon":"baby","en":"Mother & newborn","ar":"الأم والمولود","blurbEn":"Breastfeeding, recovery and the first baby checks.","blurbAr":"الرضاعة والتعافي وأول فحوصات الطفل.","situations":["baby"],"items":[{"id":216,"qty":1,"mode":"rent"},{"id":217,"qty":1,"mode":"refill"},{"id":218,"qty":1,"mode":"refill"},{"id":222,"qty":1,"mode":"buy"},{"id":220,"qty":1,"mode":"buy"},{"id":219,"qty":1,"mode":"buy"}]}
],
"banners": [
  {"id":"welcome","on":true,"img":"assets/hero-supplies.webp","link":"#/departments","en":"Everything home care needs, in one place.","ar":"كل اللي تحتاجه رعاية المريض بالبيت، بمكان واحد.","textEn":"Buy, rent or get monthly refills — delivered in 1–2 days.","textAr":"اشترِ أو استأجر أو خلّي المستلزمات توصلك كل شهر — التوصيل خلال 1–2 يوم.","ctaEn":"Browse departments","ctaAr":"تصفّح الأقسام","start":"","end":"","theme":"navy"},
  {"id":"kits","on":true,"img":"","link":"#/kits","en":"Ready-made care kits","ar":"أطقم رعاية جاهزة","textEn":"Everything for one situation — bedridden care, after surgery, diabetes — in one tap.","textAr":"كل اللي تحتاجه لحالة وحدة — طريح الفراش، بعد العملية، السكري — بضغطة وحدة.","ctaEn":"See the kits","ctaAr":"شوف الأطقم","start":"","end":"","theme":"orange"}
]
};
