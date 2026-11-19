import { describe, it, expect } from "vitest";
import { detectLanguage, resolveLanguage, parseClassification, speechLocale, type Lang } from "@/lib/language/detector";

const EN = [
  "What is the leave approval process?",
  "How do I submit an expense report?",
  "Who is responsible for approving purchase orders?",
  "List the steps for onboarding a new employee.",
  "What should I do if the machine overheats?",
  "Where can I find the incident report form?",
  "Summarize this SOP for me.",
  "What are the safety precautions before cleaning the equipment?",
  "When must the monthly audit be completed?",
  "Explain step 5 of the shipping procedure.",
  "Which form is used for requesting a refund?",
  "Can a contractor access the server room?",
  "What is the escalation path for a critical outage?",
  "How long are records kept in the archive?",
  "Tell me about the scope of this document.",
  "Is manager approval required for overtime?",
  "What is the maximum amount allowed for a petty cash claim?",
  "Describe the roles and responsibilities listed here.",
  "How often should the fire extinguishers be inspected?",
  "What happens if the supplier misses the delivery deadline?",
  "Please show the warnings in the cleaning procedure.",
  "Does this policy apply to part-time staff?",
  "Give me the checklist for closing the store.",
  "What are the working hours during the holidays?",
  "How do I reset my password in the ERP system?",
  "What is the definition of a major incident?",
  "Who signs the quality inspection sheet?",
  "Where is the first aid kit located?",
  "What documents are needed for vendor registration?",
  "How should I label hazardous materials?",
  "What is the process to request access to the CRM?",
  "Are there any exceptions to the refund policy?",
  "What is the turnaround time for a purchase requisition?",
  "Walk me through the returns procedure.",
  "Hello",
  "Step 5?",
  "SOP revision history",
  "ERP login",
  "What is the notice period for resignation?",
  "How many casual leaves are allowed per year?",
  "Who should I contact for payroll queries?",
];

const HI = [
  "छुट्टी के लिए अप्रूवल कैसे लें?",
  "इस एसओपी का उद्देश्य क्या है?",
  "खर्च की रिपोर्ट कैसे जमा करें?",
  "सुरक्षा के लिए कौन से कदम उठाने चाहिए?",
  "नए कर्मचारी को कैसे जोड़ें?",
  "मशीन गर्म हो जाए तो क्या करना चाहिए?",
  "घटना रिपोर्ट का फॉर्म कहाँ मिलेगा?",
  "रिकॉर्ड कितने समय तक रखे जाते हैं?",
  "चरण पाँच में क्या लिखा है?",
  "खरीद आदेश को कौन मंज़ूरी देता है?",
  "इस दस्तावेज़ का सारांश बताइए।",
  "ओवरटाइम के लिए प्रबंधक की अनुमति ज़रूरी है क्या?",
  "आग बुझाने के यंत्र की जाँच कितनी बार होनी चाहिए?",
  "आपूर्तिकर्ता समय पर माल न पहुँचाए तो क्या होगा?",
  "सफाई प्रक्रिया की चेतावनियाँ दिखाइए।",
  "क्या यह नियम अंशकालिक कर्मचारियों पर लागू होता है?",
  "दुकान बंद करने की सूची बताइए।",
  "छुट्टियों में काम के घंटे क्या हैं?",
  "पासवर्ड बदलने की प्रक्रिया क्या है?",
  "बड़ी घटना की परिभाषा क्या है?",
  "गुणवत्ता जाँच पत्र पर कौन हस्ताक्षर करता है?",
  "प्राथमिक चिकित्सा किट कहाँ रखी है?",
  "विक्रेता पंजीकरण के लिए कौन से दस्तावेज़ चाहिए?",
  "खतरनाक सामग्री पर लेबल कैसे लगाएँ?",
  "रिफंड नीति में कोई अपवाद है क्या?",
  "त्यौहार की छुट्टियाँ कितनी होती हैं?",
  "इस प्रक्रिया में कितना समय लगता है?",
  "इस्तीफ़े की नोटिस अवधि कितनी है?",
  "हर साल कितनी आकस्मिक छुट्टियाँ मिलती हैं?",
  "वेतन संबंधी प्रश्नों के लिए किससे संपर्क करें?",
  "SOP में सुरक्षा के नियम क्या हैं?",
  "ERP में लॉगिन कैसे करें?",
  "PDF में दिए गए चरण बताइए।",
  "कृपया चरण 3 समझाइए",
  "धन्यवाद, यह बहुत मददगार था",
];

const HINGLISH_ROMAN = [
  "Leave approval ka process kya hai?",
  "Expense report kaise submit karte hain?",
  "Mujhe onboarding ke steps batao",
  "Machine garam ho jaye to kya karna chahiye?",
  "Incident report ka form kahan milega?",
  "Step 5 kya hai?",
  "Purchase order kaun approve karta hai?",
  "Is SOP ka summary batao",
  "Records kitne time tak rakhte hain?",
  "Overtime ke liye manager ki permission chahiye kya?",
  "Fire extinguisher ki inspection kitni baar hoti hai?",
  "Supplier time par delivery na kare to kya hoga?",
  "Cleaning procedure ki warnings dikhao",
  "Kya ye policy part-time staff par lagu hoti hai?",
  "Store band karne ka checklist batao",
  "Holidays mein working hours kya hain?",
  "ERP mein password kaise reset karun?",
  "Major incident ki definition kya hai?",
  "Quality inspection sheet par sign kaun karta hai?",
  "First aid kit kahan rakha hai?",
  "Vendor registration ke liye kaun se documents chahiye?",
  "Refund policy mein koi exception hai kya?",
  "Is process mein kitna time lagta hai?",
  "Notice period kitna hota hai?",
  "Saal mein kitni casual leaves milti hain?",
  "Payroll ke sawal ke liye kisse contact karna hai?",
  "Mujhe leave ke baare mein bataiye",
  "Kya contractor server room mein ja sakta hai?",
  "Return ka procedure samjhao",
  "Ye form kaun bharega aur kab?",
  "Step 3 mein kya likha hai",
  "Roles aur responsibilities kya hain?",
  "Kya main WFH ke liye apply kar sakta hoon?",
  "Hazardous material ka label kaise lagana hai?",
  "Escalation kisko karna hai agar outage ho jaye?",
  "kya",
  "Warning kya hai?",
  "Reimbursement kab tak milega?",
  "Approval nahi mila to kya karna chahiye?",
  "Audit kab tak complete karna zaroori hai?",
];

const HINGLISH_MIXED = [
  "मुझे leave approval का process बताओ",
  "Expense report कैसे submit करें?",
  "इस SOP का summary बताओ please",
  "Purchase order को कौन approve करता है?",
  "Manager की approval ज़रूरी है क्या for overtime?",
  "Incident report का form कहाँ मिलेगा, link दो",
  "Password reset करने का process क्या है?",
  "Step 5 में क्या करना है, details बताओ",
  "Joining के दिन कौन से documents लाने हैं?",
  "Refund policy में कोई exception है क्या?",
  "Fire safety के rules क्या हैं?",
  "Audit कब तक complete करना है?",
];

function check(sentences: string[], expected: Lang, previous: Lang | null = null) {
  const wrong = sentences
    .map((s) => ({ s, got: detectLanguage(s, { previous }).language }))
    .filter((r) => r.got !== expected);
  return wrong;
}

describe("language detector (labelled sentences)", () => {
  it("has at least 100 labelled sentences", () => {
    expect(EN.length + HI.length + HINGLISH_ROMAN.length + HINGLISH_MIXED.length).toBeGreaterThanOrEqual(100);
  });
  it("classifies English", () => expect(check(EN, "en")).toEqual([]));
  it("classifies Devanagari Hindi", () => expect(check(HI, "hi")).toEqual([]));
  it("classifies Roman-script Hinglish", () => expect(check(HINGLISH_ROMAN, "hinglish")).toEqual([]));
  it("classifies mixed-script Hinglish", () => expect(check(HINGLISH_MIXED, "hinglish")).toEqual([]));
  it("overall accuracy is above 95 percent", () => {
    const all = [...EN.map((s) => [s, "en"]), ...HI.map((s) => [s, "hi"]), ...HINGLISH_ROMAN.map((s) => [s, "hinglish"]), ...HINGLISH_MIXED.map((s) => [s, "hinglish"])];
    const ok = all.filter(([s, l]) => detectLanguage(s).language === l).length;
    expect(ok / all.length).toBeGreaterThan(0.95);
  });
});

describe("language detector behaviour", () => {
  it("ignores acronyms when judging Devanagari text", () => {
    expect(detectLanguage("SOP और ERP का उपयोग कैसे करें?").language).toBe("hi");
  });
  it("lets very short Latin follow-ups inherit the previous language", () => {
    expect(detectLanguage("and step 5?", { previous: "hinglish" }).language).toBe("hinglish");
    expect(detectLanguage("and step 5?", { previous: "hi" }).language).toBe("en");
    expect(detectLanguage("छुट्टी?", { previous: "en" }).language).toBe("hi");
  });
  it("each turn can change language", () => {
    expect(detectLanguage("What is the leave policy?", { previous: "hi" }).language).toBe("en");
    expect(detectLanguage("ab ye batao kya hai", { previous: "en" }).language).toBe("hinglish");
  });
  it("uses Whisper's language only as a supporting signal", () => {
    expect(detectLanguage("please batao the leave rules for new joiners", { whisperLanguage: "hindi" }).language).toBe("hinglish");
    expect(detectLanguage("What is the leave policy", { whisperLanguage: "english" }).language).toBe("en");
  });
  it("flags ambiguous input and applies the LLM tie-breaker", async () => {
    const text = "What is the process for leave approval ka";
    expect(detectLanguage(text).confident).toBe(false);
    const r = await resolveLanguage(text, { classify: async () => "hinglish" });
    expect(r.language).toBe("hinglish");
    const fallback = await resolveLanguage(text, { classify: async () => { throw new Error("down"); } });
    expect(fallback.language).toBe("en");
  });
  it("does not call the classifier when rules are confident", async () => {
    let called = false;
    await resolveLanguage("What is the leave approval process?", { classify: async () => { called = true; return "hi"; } });
    expect(called).toBe(false);
  });
  it("parses classifier output and maps speech locales", () => {
    expect(parseClassification('{"language":"hi"}')).toBe("hi");
    expect(parseClassification("hinglish")).toBe("hinglish");
    expect(parseClassification("french")).toBeNull();
    expect(speechLocale("hi", false)).toBe("hi-IN");
    expect(speechLocale("hinglish", false)).toBe("en-IN");
    expect(speechLocale("hinglish", true)).toBe("hi-IN");
    expect(speechLocale("en", true)).toBe("en-IN");
  });
  it("handles empty input", () => {
    expect(detectLanguage("   ?? ", { previous: "hi" }).language).toBe("hi");
    expect(detectLanguage("").language).toBe("en");
  });
});
