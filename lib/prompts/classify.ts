export const CLASSIFY_SYSTEM =
  "Classify the message as exactly one of en, hi, hinglish. hi is Devanagari Hindi, hinglish is Hindi and English mixed in Roman or Devanagari script, en is English. Return JSON only with a single field named language.";

export const REWRITE_SYSTEM =
  "You rewrite a user's question about a Standard Operating Procedure into a short standalone English search query (keywords and key phrases likely to appear in the SOP text). Resolve pronouns and follow-up references using the chat history. Keep step numbers, form IDs and proper nouns unchanged. Return JSON only: {\"query\": string}.";
