// Common medical form templates — static, curated question sets for quick start

export const FORM_TEMPLATES = [
  {
    id: 'new-patient',
    name: 'New Patient Intake',
    icon: 'ClipboardList',
    category: 'General',
    description: 'Standard medical history for a first visit',
    questions: `Patient Name:
Date of Birth:
Sex assigned at birth:
Preferred pronouns:
Address:
Phone Number:
Email:
Emergency Contact Name and Phone:
Primary Care Physician:
Insurance Provider and Policy Number:

What is the reason for your visit today?
Do you have any current medical conditions or chronic illnesses?
Please list all medications you are currently taking (including over-the-counter and supplements):
Do you have any known drug allergies? If yes, please list them and the reactions:
Do you have any food or environmental allergies?
Have you had any surgeries? If yes, please list them with approximate dates:
Have you been hospitalized for any reason? If yes, when and why?
Do you have a family history of: heart disease, diabetes, cancer, high blood pressure, mental illness, or other conditions?
Do you smoke, vape, or use tobacco products? If yes, how much?
Do you drink alcohol? If yes, how often?
Are you currently pregnant or is there a chance you could be pregnant?
Do you exercise regularly? If yes, what type and how often?
Are you up to date on your vaccinations?
Is there anything else you would like the doctor to know?`,
  },
  {
    id: 'mental-health',
    name: 'Mental Health Intake',
    icon: 'Brain',
    category: 'Mental Health',
    description: 'Psychiatric or therapy first session',
    questions: `Patient Name:
Date of Birth:
Referral Source:
Primary Care Physician:

What brings you in today?
When did these concerns first begin?
Have you received mental health treatment before? If yes, please describe (therapy, medication, hospitalization):
Are you currently taking any psychiatric medications? Please list them with doses:
Do you have a history of: anxiety, depression, PTSD, bipolar disorder, ADHD, OCD, eating disorders, or other mental health conditions?
Have you ever had thoughts of harming yourself or others?
Do you currently feel safe at home?
Please list all current medications (including non-psychiatric):
Do you have any medical conditions that may affect your mental health?
Do you use alcohol, marijuana, or other substances? If yes, how often?
Family history of mental health conditions:
What are your current living arrangements?
Are you currently employed or in school?
What are your goals for treatment?
Do you have any allergies to medications?
On a scale of 1-10, how would you rate your current stress level?
How many hours of sleep do you typically get per night?
Do you exercise regularly?
Is there anything else you would like your provider to know?`,
  },
  {
    id: 'surgical-preop',
    name: 'Pre-Operative Assessment',
    icon: 'Scissors',
    category: 'Surgical',
    description: 'Pre-surgery health clearance form',
    questions: `Patient Name:
Date of Birth:
Scheduled Procedure:
Surgeon:
Date of Surgery:

Please list all current medications, including dosage and frequency:
Please list all over-the-counter medications and supplements:
Do you take any blood thinners (aspirin, warfarin, Eliquis, Plavix, etc.)?
Do you have any known drug allergies? Describe the reaction:
Do you have any latex allergies?
Have you had any previous surgeries? Please list with dates:
Have you ever had a reaction to anesthesia?
Do you or a family member have a history of malignant hyperthermia?
Do you have any of the following: heart disease, high blood pressure, diabetes, asthma, COPD, sleep apnea, kidney disease, liver disease, bleeding disorders?
Do you smoke or use tobacco? If yes, how much?
Do you drink alcohol? How often?
Do you have any loose teeth, caps, crowns, or dentures?
Do you have a pacemaker or any implanted devices?
Are you pregnant or could you be pregnant?
When was your last meal or drink?
Height and weight:
Have you had any recent illnesses, fevers, or infections?
Do you have difficulty lying flat?
Is there anything else the anesthesia team should know?`,
  },
  {
    id: 'dental',
    name: 'Dental Health History',
    icon: 'Smile',
    category: 'Dental',
    description: 'Dental office new patient form',
    questions: `Patient Name:
Date of Birth:
Dentist (if transferring):
Date of last dental visit:
Date of last dental X-rays:

What is the reason for today's visit?
Are you currently experiencing any dental pain or sensitivity?
Do you have any of the following: bleeding gums, jaw pain, grinding/clenching teeth, dry mouth, sores in mouth?
Do you have any known allergies (medications, latex, metals)?
Please list all medications you are currently taking:
Are you taking any blood thinners?
Do you have any of the following conditions: heart disease, artificial heart valve, heart murmur, high blood pressure, diabetes, asthma, hepatitis, HIV/AIDS, bleeding disorders, joint replacement?
Have you ever had a reaction to local anesthesia (novocaine)?
Have you ever had complications following dental treatment?
Do you smoke or use tobacco?
Are you pregnant or nursing?
Is there anything else you would like the dentist to know?`,
  },
  {
    id: 'ob-gyn',
    name: 'OB/GYN Annual Visit',
    icon: 'Heart',
    category: 'Women\'s Health',
    description: 'Annual gynecological visit form',
    questions: `Patient Name:
Date of Birth:
Date of last menstrual period:
Are your periods regular? Average cycle length:

What is the reason for your visit today?
Please list all medications, including birth control:
Do you have any drug allergies?
Are you currently pregnant or trying to become pregnant?
Number of pregnancies, live births, miscarriages, abortions:
Do you use any form of contraception? If yes, what type?
Do you have any menstrual concerns (heavy bleeding, missed periods, severe cramping)?
Date of your last Pap smear:
Have you ever had an abnormal Pap smear? If yes, what was done?
Date of last mammogram (if applicable):
Do you do monthly breast self-exams?
Do you have any breast concerns (lumps, pain, discharge)?
Have you ever been diagnosed with an STI?
Do you have any of the following: pelvic pain, painful intercourse, urinary problems, vaginal discharge or odor?
Family history of breast cancer, ovarian cancer, cervical cancer, or uterine cancer?
Are you experiencing any menopausal symptoms (hot flashes, mood changes, sleep problems)?
Do you smoke, drink alcohol, or use recreational drugs?
Is there anything else you would like to discuss?`,
  },
  {
    id: 'specialist-referral',
    name: 'Specialist Referral',
    icon: 'UserPlus',
    category: 'General',
    description: 'Information for a specialist first visit',
    questions: `Patient Name:
Date of Birth:
Referring Physician:
Reason for Referral:
Insurance Provider and Policy Number:

Please describe the symptoms or condition that led to this referral:
When did these symptoms first begin?
Have the symptoms been getting better, worse, or staying the same?
What treatments have already been tried for this condition?
Please list all current medications with doses:
Please list any known allergies:
Do you have any other medical conditions?
Please list any relevant past surgeries or procedures:
Have you had any recent imaging (X-rays, MRI, CT scans) or lab work related to this referral?
Do you have copies of recent test results to bring?
What are your primary concerns or questions for this specialist?
Is there anything else the specialist should know?`,
  },
  {
    id: 'insurance-prior-auth',
    name: 'Prior Authorization',
    icon: 'Shield',
    category: 'Insurance',
    description: 'Insurance prior authorization request',
    questions: `Patient Name:
Date of Birth:
Insurance Plan Name:
Member ID:
Group Number:

Medication or procedure requiring authorization:
Prescribing or ordering physician:
Physician NPI number:
Diagnosis / ICD-10 code:
What is the clinical indication for this medication/procedure?
What alternative treatments have been tried and failed? Please list with dates and reasons for discontinuation:
How long has the patient had this condition?
What is the expected duration of treatment?
Is this a new request or a renewal?
Are there any contraindications to the preferred/formulary alternatives?
Is there any supporting clinical documentation (lab results, imaging, specialist notes)?
Is this request urgent? If yes, please explain:`,
  },
  {
    id: 'pediatric',
    name: 'Pediatric Well Visit',
    icon: 'Baby',
    category: 'Pediatric',
    description: 'Child wellness check-up form',
    questions: `Child's Name:
Date of Birth:
Parent/Guardian Name:
Relationship to child:

What is the reason for today's visit?
Does your child have any current health concerns?
Please list any medications your child takes:
Does your child have any known allergies (medications, food, environmental)?
Is your child up to date on vaccinations?
Has your child had any surgeries or hospitalizations?
Does your child have any chronic conditions (asthma, eczema, diabetes, seizures, etc.)?
How is your child doing in school?
Does your child have any behavioral or developmental concerns?
How many hours of sleep does your child get per night?
Does your child participate in any sports or physical activities?
Does your child have any dietary restrictions or concerns?
Family history of: asthma, allergies, diabetes, heart disease, ADHD, learning disabilities, mental health conditions, or genetic disorders?
Is there anything else you would like the doctor to know about your child?`,
  },
];
