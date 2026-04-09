// Drug interaction database (static, ships client-side)
// Each rule: { a: [...drugNames], b: [...drugNames], severity, msg, dupCheck? }
// severity: 'danger' | 'caution' | 'info'

export const INTERACTIONS = [
  {
    a: ["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta","fluvoxamine","luvox"],
    b: ["tramadol","ultram","sumatriptan","imitrex","rizatriptan","maxalt","linezolid","zyvox","methylene blue","dextromethorphan","st john's wort"],
    severity: "danger",
    msg: "Serotonin syndrome risk, can be life-threatening",
  },
  {
    a: ["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta"],
    b: ["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta"],
    severity: "danger",
    msg: "Duplicate SSRI/SNRI, serotonin syndrome risk",
    dupCheck: true,
  },
  {
    a: ["warfarin","coumadin","eliquis","apixaban","xarelto","rivaroxaban"],
    b: ["aspirin","ibuprofen","advil","motrin","naproxen","aleve","meloxicam","mobic","diclofenac","celecoxib","celebrex"],
    severity: "danger",
    msg: "Major bleeding risk, anticoagulant + NSAID",
  },
  {
    a: ["methotrexate","azathioprine","imuran","mycophenolate","cellcept","cyclosporine","tacrolimus"],
    b: ["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","celecoxib"],
    severity: "danger",
    msg: "Kidney toxicity risk, immunosuppressant + NSAID",
  },
  {
    a: ["methotrexate"],
    b: ["trimethoprim","bactrim","sulfamethoxazole"],
    severity: "danger",
    msg: "Methotrexate toxicity, potentially fatal interaction",
  },
  {
    a: ["prednisone","prednisolone","methylprednisolone","dexamethasone","hydrocortisone"],
    b: ["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","aspirin"],
    severity: "caution",
    msg: "Increased GI bleeding risk, corticosteroid + NSAID",
  },
  {
    a: ["prednisone","prednisolone","methylprednisolone","dexamethasone"],
    b: ["metformin","glipizide","glyburide","insulin"],
    severity: "caution",
    msg: "Steroids raise blood sugar, may need diabetes med adjustment",
  },
  {
    a: ["gabapentin","neurontin","pregabalin","lyrica"],
    b: ["oxycodone","hydrocodone","morphine","fentanyl","tramadol","codeine"],
    severity: "caution",
    msg: "Increased sedation and respiratory depression risk",
  },
  {
    a: ["benzodiazepine","alprazolam","xanax","lorazepam","ativan","clonazepam","klonopin","diazepam","valium"],
    b: ["oxycodone","hydrocodone","morphine","fentanyl","tramadol","codeine","gabapentin","pregabalin"],
    severity: "danger",
    msg: "Severe respiratory depression risk, benzo + opioid/gabapentinoid",
  },
  {
    a: ["lithium"],
    b: ["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","lisinopril","losartan","hydrochlorothiazide"],
    severity: "danger",
    msg: "Can increase lithium to toxic levels",
  },
  {
    a: ["methotrexate","azathioprine","imuran","mycophenolate","cellcept","adalimumab","humira","etanercept","enbrel","infliximab","remicade","rituximab","tofacitinib","baricitinib"],
    b: ["adalimumab","humira","etanercept","enbrel","infliximab","remicade","rituximab","tofacitinib","baricitinib"],
    severity: "caution",
    msg: "Compounded immunosuppression, increased infection risk",
  },
  {
    a: ["fluoxetine","prozac","paroxetine","paxil","bupropion","wellbutrin"],
    b: ["tamoxifen"],
    severity: "caution",
    msg: "May reduce tamoxifen effectiveness",
  },
  {
    a: ["ssri","snri","sertraline","fluoxetine","paroxetine","citalopram","escitalopram","venlafaxine","duloxetine"],
    b: ["aspirin","ibuprofen","naproxen","warfarin"],
    severity: "info",
    msg: "SSRIs/SNRIs may increase bleeding tendency with these meds",
  },
  {
    a: ["levothyroxine","synthroid"],
    b: ["calcium","iron","antacid","omeprazole","prilosec","pantoprazole","protonix","sucralfate"],
    severity: "info",
    msg: "These can reduce thyroid med absorption, take 4hrs apart",
  },
  {
    a: ["hydroxychloroquine","plaquenil"],
    b: ["metformin"],
    severity: "info",
    msg: "Plaquenil may increase metformin effects, monitor blood sugar",
  },
];
