import "server-only";

export type CustomerLanguageStyle =
  | "cebuano"
  | "tagalog"
  | "taglish"
  | "english"
  | "unknown";

const STRONG_CEBUANO_PATTERN =
  /\b(?:pila|unsa|asa|naa|karon|ani|kana|kini|namo|nimo|ninyo|inyong|adto|ari|diri|didto|palihug|maayo|mopalit|kuhaon|tagpila|kumusta)\b/i;
const WEAK_CEBUANO_PATTERN =
  /\b(?:wala|pwede|pede|salamat|gusto|bayad|abot|ug|sa|ko|ka|mi|mo)\b/i;
const TAGALOG_PATTERN =
  /\b(?:magkano|ano|saan|meron|mayroon|wala|ito|iyan|yun|ako|ikaw|kami|tayo|nila|pwede|pede|paki|salamat|gusto|bumili|kuha|bayad|po|opo|ba|naman|lang|talaga)\b/i;
const ENGLISH_PATTERN =
  /\b(?:the|and|is|are|am|i|me|my|you|your|we|us|can|do|does|did|how|what|when|where|why|now|understand|got|okay|ok|yes|no|sure|really|price|available|order|buy|shipping|delivery|details|info|please|thanks|thank|hello|hi)\b/i;
const ENGLISH_CONFIRMATION_PATTERN =
  /^(?:yes|no|ok|okay|sure|now i understand|i understand|understood|got it|i get it|thanks|thank you|hello|hi)[.!?\s]*$/i;

export function detectCustomerLanguageStyle(message = ""): CustomerLanguageStyle {
  const normalizedMessage = message.toLowerCase().trim();
  const hasStrongCebuano = STRONG_CEBUANO_PATTERN.test(normalizedMessage);
  const hasWeakCebuano = WEAK_CEBUANO_PATTERN.test(normalizedMessage);
  const hasTagalog = TAGALOG_PATTERN.test(normalizedMessage);
  const hasEnglish = ENGLISH_PATTERN.test(normalizedMessage);

  if (ENGLISH_CONFIRMATION_PATTERN.test(normalizedMessage)) {
    return "english";
  }

  if (hasEnglish && !hasStrongCebuano && !hasTagalog) {
    return "english";
  }

  if (hasStrongCebuano && !hasTagalog) {
    return "cebuano";
  }

  if (hasStrongCebuano && hasEnglish && !hasTagalog) {
    return "cebuano";
  }

  if (hasWeakCebuano && !hasEnglish && !hasTagalog) {
    return "cebuano";
  }

  if (hasTagalog && hasEnglish) {
    return "taglish";
  }

  if (hasTagalog) {
    return "tagalog";
  }

  if (hasEnglish) {
    return "english";
  }

  return "unknown";
}

export function getMissingInfoReply(customerMessage = "") {
  switch (detectCustomerLanguageStyle(customerMessage)) {
    case "cebuano":
      return "Wala pa koy exact nga info ana. Pwede tika tabangan sa uban pang pangutana, or ipa-forward nato sa team kung kinahanglan.";
    case "tagalog":
      return "Wala pa akong exact info tungkol diyan. Pwede pa rin kitang tulungan sa ibang tanong, o i-forward natin sa team kung kailangan.";
    case "taglish":
      return "Wala pa akong exact info about that po. I can still help with other questions, or we can forward this to our team if needed.";
    default:
      return "I don't have the exact info on that yet, but our team will check and message you shortly. In the meantime, do you have any other questions?";
  }
}

export function getLeadCapturedReply(customerMessage = "") {
  switch (detectCustomerLanguageStyle(customerMessage)) {
    case "cebuano":
      return "Salamat, nadawat na nako imong details. Mo-follow up ang among team sa imoha soon.";
    case "tagalog":
      return "Salamat, nakuha ko na ang details mo. Magfo-follow up ang team namin sa iyo soon.";
    case "taglish":
      return "Thank you po, I got your details. Our team will follow up shortly.";
    default:
      return "Thank you, I got your details. Our team will follow up shortly.";
  }
}
