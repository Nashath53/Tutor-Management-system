"""Generates all HTML pages from one template so the <head> stays consistent.
Run:  python3 tools/build_html.py   (only needed if you change the template)."""
import os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def head(title, base, desc="Mentora Learning Centre, Negombo — tuition classes for Grades 6–13 in English and Tamil medium, online and physical."):
    return f'''<!doctype html>
<html lang="en" data-base="{base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#2563EB">
<script>try{{if(JSON.parse(localStorage.getItem('mentora-theme'))==='dark'){{document.documentElement.dataset.theme='dark';document.documentElement.setAttribute('data-bs-theme','dark');}}}}catch(e){{}}</script>
<link rel="manifest" href="{base}manifest.webmanifest">
<link rel="icon" href="{base}assets/icons/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="{base}assets/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" crossorigin="anonymous">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" crossorigin="anonymous">
<link rel="stylesheet" href="{base}css/style.css">
<link rel="stylesheet" href="{base}css/components.css">
'''

def tail(base, script):
    return f'''<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous" defer></script>
<script type="module" src="{base}js/pages/{script}.js"></script>
</body>
</html>
'''

def public(file, title, script, main):
    out = head(title, "") + '</head>\n<body>\n<div id="site-header"></div>\n<main id="main" tabindex="-1">\n' + main + '\n</main>\n<div id="site-footer"></div>\n' + tail("", script)
    open(os.path.join(ROOT, file), "w").write(out)

def i(key, text, tag="span", cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<{tag}{c} data-i18n="{key}">{text}</{tag}>'

def page_hero(eyebrow, h1, p):
    return f'''<section class="page-hero"><div class="container">
  {i(eyebrow[0], eyebrow[1], "span", "eyebrow")}
  {i(h1[0], h1[1], "h1")}
  {i(p[0], p[1], "p", "lead")}
</div></section>'''

# ---------- HOME ----------
home = f'''<section class="hero"><div class="hero-mesh" aria-hidden="true"><span></span><span></span><span></span></div><div class="hero-grid" aria-hidden="true"></div>
<div class="container position-relative"><div class="row align-items-center g-5">
  <div class="col-lg-6">
    <span class="hero-badge"><span class="dot" data-i18n="home.badgeNew">New</span><span data-i18n="home.badgeText">2 free trial classes for every new student</span></span>
    <h1><span data-i18n="home.title1">Classes that fit your child</span> <em data-i18n="home.title2">Try two for free</em></h1>
    {i("home.lead","Small online and physical classes with verified teachers. Start with two free trial sessions — no admission form needed. Pay only after you decide to continue.","p","lead")}
    <div class="hero-cta">
      <a class="btn btn-primary btn-lg" href="courses.html"><i class="bi bi-calendar2-check" aria-hidden="true"></i><span data-i18n="home.ctaTrial">Book a free trial</span></a>
      <a class="btn btn-ghost btn-lg" href="teachers.html"><i class="bi bi-person-badge" aria-hidden="true"></i><span data-i18n="home.ctaTeachers">Meet the teachers</span></a>
    </div>
    <div class="trust-row"><span><i class="bi bi-patch-check-fill" aria-hidden="true"></i><span data-i18n="home.trust1">Verified teachers</span></span><span><i class="bi bi-shield-lock-fill" aria-hidden="true"></i><span data-i18n="home.trust2">Receipts issued by the system</span></span><span><i class="bi bi-translate" aria-hidden="true"></i><span data-i18n="home.trust3">English &amp; Tamil</span></span></div>
    <div class="stat-strip">
      <div><div class="stat-n" id="statStudents">0</div>{i("home.statStudents","Active students","div","lbl")}</div>
      <div><div class="stat-n" id="statClasses">0</div>{i("home.statClasses","Open classes","div","lbl")}</div>
      <div><div class="stat-n" id="statTeachers">0</div>{i("home.statTeachers","Verified teachers","div","lbl")}</div>
      <div><div class="stat-n accent" id="statRating">–</div>{i("home.statRating","Average rating","div","lbl")}</div>
    </div>
  </div>
  <div class="col-lg-6"><div class="hero-visual" aria-hidden="true">
    <div class="hv-card hv-rating"><div class="stars"><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i></div><div class="small fw-bold mt-1" data-i18n="home.hvRating">Loved by parents</div><div class="small text-muted" data-i18n="home.hvRatingSub">Verified reviews only</div></div>
    <div class="hv-card hv-timetable">
      <div class="d-flex justify-content-between align-items-center mb-2 gap-2"><b data-i18n="home.hvToday">This week</b><span class="chip chip-teal" data-i18n="home.hvOnline">Online + physical</span></div>
      <div id="hvRows"><div class="hv-row"><span class="hv-time">SAT 8:00</span><span>Mathematics · G10</span><span class="chip">EN</span></div>
      <div class="hv-row"><span class="hv-time">SUN 2:00</span><span>ICT · G11</span><span class="chip">TA</span></div>
      <div class="hv-row"><span class="hv-time">WED 3:30</span><span>Combined Maths · G12</span><span class="chip">TA</span></div></div>
    </div>
    <div class="hv-card hv-trial"><b data-i18n="home.hvTrial">Free trial progress</b><div class="small text-muted" data-i18n="home.hvTrialSub">1 of 2 sessions attended</div><div class="trial-dots"><span class="done"></span><span></span></div></div>
    <div class="hv-card hv-receipt"><div class="small" data-i18n="home.hvReceipt">Verified receipt</div><div class="hv-amount">LKR 2,500</div><div class="d-flex justify-content-between align-items-center"><span class="small">MR-2026-000128</span><span class="hv-ok"><i class="bi bi-check-circle-fill"></i>PAID</span></div></div>
  </div></div>
</div></div></section>

<section class="section section-alt"><div class="container">
  <div class="section-head center">{i("home.howEyebrow","How it works","span","eyebrow")}{i("home.howTitle","From first trial to paid class, step by step","h2")}</div>
  <div class="steps">
    <div class="step" data-reveal>{i("home.step1","Choose a class","h3")}{i("home.step1p","Filter by subject, grade, medium and online or physical mode.","p")}</div>
    <div class="step" data-reveal>{i("home.step2","Attend 2 free trials","h3")}{i("home.step2p","No admission form for the trial. Just your name and WhatsApp number.","p")}</div>
    <div class="step" data-reveal>{i("home.step3","Request admission","h3")}{i("home.step3p","Fill the admission form and pay by bank transfer or cash at the centre.","p")}</div>
    <div class="step" data-reveal>{i("home.step4","Admin approves","h3")}{i("home.step4p","Once the payment is verified, the admin activates your paid enrolment and portal.","p")}</div>
  </div>
</div></section>

<section class="section"><div class="container">
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 section-head mw-100">
    <div>{i("home.subjectsEyebrow","Subjects","span","eyebrow")}{i("home.subjectsTitle","What we teach","h2")}</div>
    <a class="btn btn-ghost" href="courses.html"><span data-i18n="common.viewAll">View all</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a>
  </div>
  <div class="row g-4" id="subjectGrid"><div class="col-12"><div class="skeleton skeleton-card"></div></div></div>
</div></section>

<section class="section section-alt"><div class="container"><div class="row g-5 align-items-center">
  <div class="col-lg-5">{i("home.whyEyebrow","Why Mentora","span","eyebrow")}{i("home.whyTitle","Clear for parents, fair for teachers","h2")}{i("home.whyLead","Every payment is verified by staff and every receipt is issued by the system — so you always know exactly what you paid for.","p","text-muted")}
    <a class="btn btn-primary mt-2" href="join-class.html"><span data-i18n="home.ctaJoin">Join a class</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
  <div class="col-lg-7"><div class="row g-4">
    <div class="col-sm-6" data-reveal><div class="feature"><span class="feature-icon"><i class="bi bi-patch-check" aria-hidden="true"></i></span><div>{i("home.f1","Verified teachers","h3")}{i("home.f1p","Qualifications are checked before a profile is published.","p")}</div></div></div>
    <div class="col-sm-6" data-reveal><div class="feature"><span class="feature-icon"><i class="bi bi-translate" aria-hidden="true"></i></span><div>{i("home.f2","English &amp; Tamil","h3")}{i("home.f2p","Classes, website and portal in both languages.","p")}</div></div></div>
    <div class="col-sm-6" data-reveal><div class="feature"><span class="feature-icon"><i class="bi bi-receipt" aria-hidden="true"></i></span><div>{i("home.f3","Transparent fees","h3")}{i("home.f3p","Monthly statements show every session and payment.","p")}</div></div></div>
    <div class="col-sm-6" data-reveal><div class="feature"><span class="feature-icon"><i class="bi bi-phone" aria-hidden="true"></i></span><div>{i("home.f4","Works on your phone","h3")}{i("home.f4p","Install the app and check classes even with weak signal.","p")}</div></div></div>
  </div></div>
</div></div></section>

<section class="section"><div class="container">
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 section-head mw-100">
    <div>{i("home.teachersEyebrow","Teachers","span","eyebrow")}{i("home.teachersTitle","Meet our verified teachers","h2")}{i("home.teachersLead","Experience levels, verified qualifications and real ratings from students and parents.","p")}</div>
    <a class="btn btn-ghost" href="teachers.html"><span data-i18n="common.viewAll">View all</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a>
  </div>
  <div class="row g-4" id="teacherPreview"><div class="col-12"><div class="skeleton skeleton-card"></div></div></div>
</div></section>

<section class="section section-alt" id="testimonials"><div class="container">
  <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 section-head mw-100">
    <div>{i("home.testiEyebrow","Testimonials","span","eyebrow")}{i("home.testiTitle","What students and parents say","h2")}{i("home.testiLead","Every testimonial is checked by the Mentora admin before it appears here.","p")}</div>
    <div class="d-flex gap-2 flex-wrap"><div class="track-nav"><button type="button" class="btn btn-ghost btn-icon" data-track="-1" data-i18n-aria="common.previous"><i class="bi bi-chevron-left" aria-hidden="true"></i></button><button type="button" class="btn btn-ghost btn-icon" data-track="1" data-i18n-aria="common.next"><i class="bi bi-chevron-right" aria-hidden="true"></i></button></div>
    <button type="button" class="btn btn-primary" id="shareStoryBtn"><i class="bi bi-chat-heart" aria-hidden="true"></i><span data-i18n="home.testiShare">Share your experience</span></button></div>
  </div>
  <div class="testi-track" id="testiTrack" tabindex="0" data-i18n-aria="home.testiTitle"><div class="skeleton skeleton-card"></div></div>
</div></section>

<section class="section" id="faq"><div class="container"><div class="row g-5">
  <div class="col-lg-4">{i("home.faqEyebrow","Questions","span","eyebrow")}{i("home.faqTitle","Everything you need to know","h2")}{i("home.faqLead","How trials, admission, fees, the student portal and teaching at Mentora work — in plain words.","p","text-muted")}
    <div class="m-card m-card-sm mt-4 d-flex gap-3 align-items-center"><span class="feature-icon"><i class="bi bi-whatsapp" aria-hidden="true"></i></span><div><b class="d-block small" data-i18n="home.faqMore">Still have a question?</b><a class="small" href="contact.html" data-i18n="home.faqContact">Contact the office</a></div></div></div>
  <div class="col-lg-8"><div class="faq-tabs" role="tablist" id="faqTabs"></div><div class="m-accordion" id="faqList"></div></div>
</div></div></section>

<section class="section section-alt" id="survey"><div class="container"><div class="row g-5 align-items-center">
  <div class="col-lg-5">{i("home.surveyEyebrow","Help us improve","span","eyebrow")}{i("home.surveyTitle","Tell us what you need","h2")}{i("home.surveyLead","Takes 1 minute. Tell us which classes, papers, recordings or ideas would help you most. You can stay anonymous.","p","text-muted")}
    <ul class="list-unstyled small d-grid gap-2 mt-3 text-muted"><li><i class="bi bi-check2-circle text-success me-2" aria-hidden="true"></i><span data-i18n="home.surveyB1">We read every answer</span></li><li><i class="bi bi-check2-circle text-success me-2" aria-hidden="true"></i><span data-i18n="home.surveyB2">Most-requested papers and classes get added first</span></li><li><i class="bi bi-check2-circle text-success me-2" aria-hidden="true"></i><span data-i18n="home.surveyB3">Your contact number is optional and private</span></li></ul></div>
  <div class="col-lg-7"><div class="survey-card" id="surveyMount"></div></div>
</div></div></section>

<section class="section pt-0 section-cta"><div class="container"><div class="cta-band"><div class="row align-items-center g-4 position-relative">
  <div class="col-lg-8">{i("home.ctaTitle","Are you a teacher? Teach with Mentora.","h2")}{i("home.ctaText","0% commission for your first 20 students in your first month. Online or at our Negombo centre.","p","mb-0")}</div>
  <div class="col-lg-4 text-lg-end"><a class="btn btn-accent btn-lg" href="teach-with-us.html"><span data-i18n="home.ctaApply">Apply to teach</span><i class="bi bi-arrow-right" aria-hidden="true"></i></a></div>
</div></div></div></section>'''
public("index.html", "Mentora Learning Centre — Tuition classes in Negombo", "home", home)

public("courses.html", "Classes — Mentora Learning Centre", "courses", page_hero(("courses.eyebrow","Classes"),("courses.title","Find a class and try it free"),("courses.lead","Every class includes free trial sessions. Choose a class and tap “Book free trial”.")) + f'''
<section class="section section-tight"><div class="container">
  <div class="filter-bar mb-3">
    <div class="search-wrap"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="classSearch" data-i18n-placeholder="courses.searchPh" placeholder="Search subject, grade or teacher" aria-label="Search classes"></div>
    <div class="seg" id="modeSeg" role="tablist"></div>
    <select class="form-select w-auto" id="sortSel" aria-label="Sort"></select>
  </div>
  <div class="m-card m-card-sm mb-4" id="filters"></div>
  <p class="small text-muted mb-3" id="resultCount" aria-live="polite"></p>
  <div class="row g-4" id="classGrid"><div class="col-12"><div class="skeleton skeleton-card"></div></div></div>
</div></section>''')

public("teachers.html", "Teachers — Mentora Learning Centre", "teachers", page_hero(("teachers.eyebrow","Teachers"),("teachers.title","Our verified teachers"),("teachers.lead","Every teacher profile is reviewed by the Mentora admin before it is published.")) + f'''
<section class="section section-tight"><div class="container">
  <div class="filter-bar mb-4">
    <div class="search-wrap"><i class="bi bi-search" aria-hidden="true"></i><input type="search" class="form-control" id="teacherSearch" data-i18n-placeholder="teachers.searchPh" placeholder="Search by name or subject" aria-label="Search teachers"></div>
    <select class="form-select w-auto" id="subjectFilter" aria-label="Subject"></select>
    <select class="form-select w-auto" id="teacherSort" aria-label="Sort"></select>
  </div>
  <div class="row g-4" id="teacherGrid"><div class="col-12"><div class="skeleton skeleton-card"></div></div></div>
</div></section>''')

public("teacher-profile.html", "Teacher profile — Mentora Learning Centre", "teacher-profile", '''
<section class="section section-tight pb-0"><div class="container"><div class="tp-hero" id="tpHero"><div class="skeleton skeleton-card"></div></div></div></section>
<section class="section section-tight"><div class="container"><div class="row g-4">
  <div class="col-lg-8 d-grid gap-4 align-content-start">
    <div class="m-card" id="tpAbout"></div>
    <div class="m-card" id="tpMedia"></div>
    <div class="m-card" id="tpClasses"></div>
  </div>
  <div class="col-lg-4 d-grid gap-4 align-content-start">
    <div class="m-card" id="tpRating"></div>
    <div class="m-card" id="tpReviews"></div>
  </div>
</div></div></section>''')

public("join-class.html", "Join a class — Mentora Learning Centre", "join-class", page_hero(("join.eyebrow","Admission"),("join.title","Student admission form"),("join.lead","Already finished your free trial, or ready to join directly? Fill this form. The admin will contact you on WhatsApp with payment details.")) + '''
<section class="section section-tight"><div class="container"><div class="row justify-content-center"><div class="col-lg-9" id="formMount"></div></div></div></section>''')

public("teach-with-us.html", "Teach with us — Mentora Learning Centre", "teach-with-us", page_hero(("teach.eyebrow","Teach with Mentora"),("teach.title","Teacher application"),("teach.lead","Share your subjects, grades and availability. Your CV and certificates are private and only seen by the Mentora admin.")) + f'''
<section class="section section-tight"><div class="container"><div class="row g-5">
  <div class="col-lg-4 order-lg-2"><div class="sticky-lg d-grid gap-4">
    <details class="comm-card" open>
      <summary><span class="feature-icon"><i class="bi bi-percent" aria-hidden="true"></i></span><span class="flex-grow-1"><b class="d-block" data-i18n="teach.termsTitle">Commission terms</b><span class="small text-muted" data-i18n="teach.termsSub">Simple and transparent</span></span></summary>
      <div class="cc-in">
        <div class="tier"><span class="pct">0%</span><div><b class="d-block small" data-i18n="teach.tier1">First month</b><span class="small text-muted" data-i18n="teach.term1">0% commission in your first eligible month for your first 20 eligible students.</span></div></div>
        <div class="tier t2"><span class="pct">5%</span><div><b class="d-block small" data-i18n="teach.tier2">After that</b><span class="small text-muted" data-i18n="teach.term2">After that, 5% of eligible collected class fees.</span></div></div>
        <div class="tier t3"><span class="pct"><i class="bi bi-shield-check" aria-hidden="true"></i></span><div><b class="d-block small" data-i18n="teach.tier3">Never charged</b><span class="small text-muted" data-i18n="teach.term3">Admission fees and refunds are never included.</span></div></div>
        <p class="small text-muted mb-0 mt-2"><i class="bi bi-info-circle me-1" aria-hidden="true"></i><span data-i18n="teach.term4">Statutory tax (WHT) is separate from commission and follows Sri Lanka IRD rules.</span></p>
      </div>
    </details>
    <details class="comm-card">
      <summary><span class="feature-icon"><i class="bi bi-calculator" aria-hidden="true"></i></span><span class="flex-grow-1"><b class="d-block" data-i18n="teach.calcTitle">Earnings calculator</b><span class="small text-muted" data-i18n="teach.calcSub">See what you take home</span></span></summary>
      <div class="cc-in" id="calcMount"></div>
    </details>
    <div class="m-card m-card-sm"><b class="d-block mb-2" data-i18n="teach.perksTitle">What you get</b><ul class="list-unstyled small d-grid gap-2 mb-0 text-muted">
      <li><i class="bi bi-patch-check-fill text-success me-2" aria-hidden="true"></i><span data-i18n="teach.perk1">A verified public profile with ratings</span></li>
      <li><i class="bi bi-calendar-week text-success me-2" aria-hidden="true"></i><span data-i18n="teach.perk2">Your own teacher panel: timetable, roster, earnings</span></li>
      <li><i class="bi bi-receipt text-success me-2" aria-hidden="true"></i><span data-i18n="teach.perk3">Fees collected and receipted for you</span></li>
      <li><i class="bi bi-megaphone text-success me-2" aria-hidden="true"></i><span data-i18n="teach.perk4">Promotion of your free sessions and videos</span></li></ul></div>
  </div></div>
  <div class="col-lg-8 order-lg-1" id="formMount"></div>
</div></div></section>''')

public("contact.html", "Contact — Mentora Learning Centre", "contact", page_hero(("contact.eyebrow","Contact"),("contact.title","Talk to us"),("contact.lead","The fastest way to reach us is WhatsApp. You can also call or visit the centre.")) + f'''
<section class="section section-tight"><div class="container">
  <div class="row g-4 mb-5" id="contactCards"></div>
  <div class="row g-4 align-items-stretch">
    <div class="col-lg-7"><div class="map-frame" id="mapFrame"><div id="map" role="region" data-i18n-aria="contact.mapLabel"></div>
      <div class="map-ph" id="mapPh"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i><span data-i18n="contact.mapLoading">Loading map…</span></div>
      <div class="map-overlay" id="mapOverlay"></div></div></div>
    <div class="col-lg-5"><div class="m-card h-100" id="complaint">
      {i("contact.complaintEyebrow","Feedback & complaints","span","eyebrow")}{i("contact.complaintTitle","Something not right? Tell us.","h2","h4")}{i("contact.complaintLead","Complaints go directly to the admin. You will get a reference number to follow up.","p","text-muted small")}
      <div id="complaintMount"></div></div></div>
  </div>
</div></section>''')

def bi(en, ta):
    return f'<div class="lang-en">{en}</div><div class="lang-ta" lang="ta">{ta}</div>'
privacy_body = bi('''
<h2 class="h4">What we collect</h2><p>Student name, grade, school, guardian name, phone/WhatsApp number, email (optional), class choices, attendance and payment records. For teacher applicants: contact details, subjects, qualifications and optional CV/certificates.</p>
<h2 class="h4">Why we collect it</h2><p>To run classes, contact you about trials and admission, keep attendance, issue fee statements and receipts, and pay teachers. We do not sell your data or use it for advertising.</p>
<h2 class="h4">Who can see it</h2><p>Only Mentora admin and authorised cashier staff. Students can only see their own records. Teacher CVs and certificates are private and never shown on the public website. Public teacher profiles show only what the admin approves.</p>
<h2 class="h4">Guardian consent</h2><p>If the student is under 18, a parent or guardian must agree to this notice when submitting the form.</p>
<h2 class="h4">WhatsApp</h2><p>Our forms can open WhatsApp with a pre-filled message. WhatsApp is operated by Meta; please read its privacy policy. Opening WhatsApp does not send anything automatically — you choose whether to send it.</p>
<h2 class="h4">Storage &amp; security</h2><p>Data is stored in a secured database (Supabase) with row-level security. Payment records are never deleted; corrections are made with audited reversals.</p>
<h2 class="h4">Your rights</h2><p>You can ask us to see, correct or delete your personal data (except financial records we must keep by law) by contacting us on WhatsApp or email.</p>''','''
<h2 class="h4">நாம் சேகரிக்கும் தகவல்கள்</h2><p>மாணவர் பெயர், தரம், பாடசாலை, பாதுகாவலர் பெயர், தொலைபேசி/WhatsApp இலக்கம், மின்னஞ்சல் (விரும்பினால்), வகுப்புத் தெரிவுகள், வரவு மற்றும் கட்டணப் பதிவுகள். ஆசிரியர் விண்ணப்பதாரர்களுக்கு: தொடர்பு விவரங்கள், பாடங்கள், தகைமைகள் மற்றும் விரும்பினால் CV/சான்றிதழ்கள்.</p>
<h2 class="h4">ஏன் சேகரிக்கிறோம்</h2><p>வகுப்புகளை நடத்த, சோதனை வகுப்புகள் மற்றும் அனுமதி தொடர்பாக உங்களைத் தொடர்புகொள்ள, வரவைப் பதிவு செய்ய, கட்டண அறிக்கைகள் மற்றும் பற்றுச்சீட்டுகள் வழங்க, ஆசிரியர்களுக்குக் கொடுப்பனவு செய்ய. உங்கள் தரவை விற்பதில்லை.</p>
<h2 class="h4">யார் பார்க்கலாம்</h2><p>Mentora நிர்வாகி மற்றும் அங்கீகரிக்கப்பட்ட காசாளர் மட்டுமே. மாணவர்கள் தங்கள் சொந்தப் பதிவுகளை மட்டுமே பார்க்க முடியும். ஆசிரியர் CV மற்றும் சான்றிதழ்கள் பொது இணையதளத்தில் ஒருபோதும் காட்டப்படாது.</p>
<h2 class="h4">பாதுகாவலர் ஒப்புதல்</h2><p>மாணவர் 18 வயதுக்குக் குறைந்தவராயின், படிவத்தைச் சமர்ப்பிக்கும் போது பெற்றோர் அல்லது பாதுகாவலர் இந்த அறிவிப்புக்கு ஒப்புக்கொள்ள வேண்டும்.</p>
<h2 class="h4">WhatsApp</h2><p>எங்கள் படிவங்கள் முன்கூட்டியே நிரப்பப்பட்ட செய்தியுடன் WhatsApp ஐத் திறக்கலாம். WhatsApp ஐத் திறப்பது தானாகச் செய்தி அனுப்பாது — அனுப்புவதா என்பதை நீங்களே தீர்மானிக்கிறீர்கள்.</p>
<h2 class="h4">சேமிப்பு மற்றும் பாதுகாப்பு</h2><p>தரவு பாதுகாப்பான தரவுத்தளத்தில் (Supabase) சேமிக்கப்படுகிறது. கட்டணப் பதிவுகள் ஒருபோதும் நீக்கப்படுவதில்லை; திருத்தங்கள் தணிக்கை செய்யப்பட்ட மீளளிப்புகள் மூலம் செய்யப்படுகின்றன.</p>
<h2 class="h4">உங்கள் உரிமைகள்</h2><p>உங்கள் தனிப்பட்ட தரவைப் பார்க்க, திருத்த அல்லது நீக்க WhatsApp அல்லது மின்னஞ்சல் மூலம் எங்களைத் தொடர்புகொள்ளலாம் (சட்டப்படி வைத்திருக்க வேண்டிய நிதிப் பதிவுகள் தவிர).</p>''')
public("privacy.html", "Privacy notice — Mentora Learning Centre", "privacy", page_hero(("privacy.eyebrow","Privacy"),("privacy.title","Privacy notice"),("privacy.lead","How Mentora Learning Centre collects, uses and protects personal information.")) + f'''
<section class="section section-tight"><div class="container"><div class="row justify-content-center"><div class="col-lg-8"><article class="m-card prose">{privacy_body}<p class="small text-muted mt-4 mb-0" data-i18n="privacy.updated">Last updated: November 2026</p></article></div></div></div></section>''')

# ---------- LOGIN / OFFLINE (standalone) ----------
login = head("Sign in — Mentora Learning Centre", "") + '''</head>
<body class="auth-body">
<main id="main" class="auth-wrap">
  <div class="auth-card">
    <div class="d-flex justify-content-between align-items-center mb-4"><div id="loginBrand"></div><div id="loginLang"></div></div>
    <h1 class="h3 mb-1" data-i18n="login.title">Sign in</h1>
    <p class="text-muted small mb-4" data-i18n="login.lead">Students, admin and cashier staff sign in here.</p>
    <form id="loginForm" novalidate>
      <div class="mb-3"><label class="form-label" for="email" data-i18n="login.email">Email</label>
        <input class="form-control" type="email" id="email" name="email" autocomplete="email" required>
        <div class="invalid-feedback" data-i18n="validation.email">Enter a valid email address.</div></div>
      <div class="mb-2"><label class="form-label" for="password" data-i18n="login.password">Password</label>
        <input class="form-control" type="password" id="password" name="password" autocomplete="current-password" required minlength="6">
        <div class="invalid-feedback" data-i18n="validation.password">Password must be at least 6 characters.</div></div>
      <div class="text-end mb-3"><button type="button" class="btn btn-link btn-sm px-0" id="forgotBtn" data-i18n="login.forgot">Forgot password?</button></div>
      <button class="btn btn-primary w-100 btn-lg" type="submit" data-i18n="login.submit">Sign in</button>
    </form>
    <p class="small text-muted mt-4 mb-0" data-i18n="login.noAccount">Students get a login after the admin approves their admission.</p>
    <div class="m-card m-card-sm mt-4" id="demoAccounts" hidden></div>
    <a class="small d-inline-block mt-4" href="index.html"><i class="bi bi-arrow-left me-1" aria-hidden="true"></i><span data-i18n="login.back">Back to website</span></a>
  </div>
</main>
''' + tail("", "login")
open(os.path.join(ROOT, "login.html"), "w").write(login)

offline = head("Offline — Mentora Learning Centre", "") + '''</head>
<body class="auth-body">
<main id="main" class="auth-wrap">
  <div class="auth-card text-center">
    <div class="d-flex justify-content-center mb-4" id="offlineBrand"></div>
    <i class="bi bi-wifi-off display-5 text-muted" aria-hidden="true"></i>
    <h1 class="h4 mt-3">You are offline <span class="d-block small text-muted mt-1" lang="ta">நீங்கள் இணைப்பில் இல்லை</span></h1>
    <p class="text-muted">This page needs an internet connection. Pages you opened before may still work. Any saved drafts stay on this device.</p>
    <p class="text-muted small" lang="ta">இந்தப் பக்கத்துக்கு இணைய இணைப்பு தேவை. சேமித்த வரைவுகள் இந்தச் சாதனத்திலேயே இருக்கும்.</p>
    <button class="btn btn-primary" type="button" id="retryBtn">Try again · மீண்டும் முயற்சி</button>
  </div>
</main>
''' + tail("", "offline")
open(os.path.join(ROOT, "offline.html"), "w").write(offline)

# ---------- PORTAL ----------
PORTAL = {"index":"My dashboard","classes":"My classes","fees":"Fees & payments","attendance":"Attendance","notices":"Notices","recordings":"Recordings","profile":"My profile"}
os.makedirs(os.path.join(ROOT, "portal"), exist_ok=True)
for p, title in PORTAL.items():
    out = head(f"{title} — Mentora student portal", "../") + '<link rel="stylesheet" href="../css/portal.css">\n<meta name="robots" content="noindex">\n</head>\n<body class="portal-body">\n<header class="portal-nav no-print" id="portal-nav"></header>\n<main id="main" class="portal-main container" tabindex="-1"><div id="portal-content"><div class="skeleton skeleton-card mt-4"></div></div></main>\n' + tail("../", f"portal/{p}")
    open(os.path.join(ROOT, "portal", f"{p}.html"), "w").write(out)

# ---------- ADMIN ----------
ADMIN = {"index":"Dashboard","subjects":"Subjects","students":"Students","enquiries":"Enquiries","teachers":"Teachers","teacher-applications":"Teacher applications","classes":"Classes","enrollments":"Enrolments","attendance":"Attendance","content":"Notices & recordings","fees":"Fees","payments":"Payments","receipts":"Receipts","teacher-finance":"Teacher finance","settlements":"Settlements","reports":"Reports","settings":"Settings","requests":"Approvals inbox","feedback":"Feedback & reviews","timetable":"Timetable"}
os.makedirs(os.path.join(ROOT, "admin"), exist_ok=True)
for p, title in ADMIN.items():
    out = head(f"{title} — Mentora admin", "../") + '<link rel="stylesheet" href="../css/admin.css">\n<meta name="robots" content="noindex">\n</head>\n<body class="admin-body">\n<div class="admin-layout">\n  <aside id="admin-sidebar" class="admin-sidebar no-print" aria-label="Admin navigation"></aside>\n  <div class="admin-main">\n    <header id="admin-topbar" class="admin-topbar no-print"></header>\n    <main id="admin-content" class="admin-content" tabindex="-1"><div class="skeleton skeleton-card"></div></main>\n  </div>\n</div>\n' + tail("../", f"admin/{p}")
    open(os.path.join(ROOT, "admin", f"{p}.html"), "w").write(out)

# ---------- TEACHER PANEL ----------
TEACHER = {"index":"Dashboard","timetable":"Timetable","classes":"My classes","attendance":"Attendance","content":"Recordings & resources","earnings":"Earnings","reviews":"Reviews","profile":"My profile"}
os.makedirs(os.path.join(ROOT, "teacher"), exist_ok=True)
for p, title in TEACHER.items():
    out = head(f"{title} — Mentora teacher panel", "../") + '<link rel="stylesheet" href="../css/admin.css">\n<meta name="robots" content="noindex">\n</head>\n<body class="admin-body teacher-area">\n<div class="admin-layout">\n  <aside id="admin-sidebar" class="admin-sidebar no-print" aria-label="Teacher navigation"></aside>\n  <div class="admin-main">\n    <header id="admin-topbar" class="admin-topbar no-print"></header>\n    <main id="admin-content" class="admin-content" tabindex="-1"><div class="skeleton skeleton-card"></div></main>\n  </div>\n</div>\n' + tail("../", f"teacher/{p}")
    open(os.path.join(ROOT, "teacher", f"{p}.html"), "w").write(out)
print("ok")
