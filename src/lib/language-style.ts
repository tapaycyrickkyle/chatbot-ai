import "server-only";

export type CustomerLanguageStyle =
  | "cebuano"
  | "tagalog"
  | "taglish"
  | "english"
  | "unknown";

const STRONG_CEBUANO_PATTERN =
  /\b(?:pila|pilay|unsa|unsay|asa|naa|karon|ani|kana|kani|kini|namo|nimo|ninyo|inyong|adto|adtoon|ari|diri|didto|palihug|maayo|mopalit|kuhaon|kuhaa|tagpila|kumusta)\b/i;
const CEBUANO_PHRASE_PATTERN =
  /\b(?:pila\s+(?:ni|na|ang)|naa\s+(?:pa|pani|ba)|asa\s+(?:ni|dapit)|pwede\s+(?:ra|ba|ko|mi|mo)|mo\s+(?:deliver|ship|kuha|dawat|bayad))\b/i;
const WEAK_CEBUANO_PATTERN =
  /\b(?:wala|pwede|pede|salamat|gusto|bayad|abot|ug|sa|ko|ka|mi|mo)\b/i;
const TAGALOG_PATTERN =
  /\b(?:magkano|ano|saan|meron|mayroon|wala|ito|iyan|yun|ako|ikaw|kami|tayo|nila|pwede|pede|paki|salamat|gusto|bumili|kuha|bayad|po|opo|ba|naman|lang|talaga)\b/i;
const ENGLISH_PATTERN =
  /\b(?:the|and|is|are|am|i|me|my|you|your|we|us|can|do|does|did|how|what|when|where|why|now|understand|got|okay|ok|yes|no|sure|really|price|available|order|buy|shipping|delivery|details|info|please|thanks|thank|hello|hi)\b/i;
const ENGLISH_CONFIRMATION_PATTERN =
  /^(?:yes|no|ok|okay|sure|now i understand|i understand|understood|got it|i get it|thanks|thank you|hello|hi)[.!?\s]*$/i;
const MISSING_INFO_REPLIES: Record<CustomerLanguageStyle, string[]> = {
  cebuano: [
    "Ipa-forward nato ni sa team para matabangan ka nila sa sakto nga detalye.",
    "Ipa-check nato ni sa team para mahatagan ka nila sa klaro nga tubag.",
    "Ako ni ipasa sa team para matabangan ka nila ug tarong.",
  ],
  tagalog: [
    "Ipa-forward natin ito sa team para matulungan ka nila sa exact details.",
    "Ipa-check natin ito sa team para mabigyan ka nila ng tamang info.",
    "Ipa-assist natin ito sa team para masagot ka nila nang maayos.",
  ],
  taglish: [
    "I'll forward this to our team po so they can help you with the exact details.",
    "Let me have our team check this po so they can give you the right info.",
    "I'll pass this to our team po so they can assist you properly.",
  ],
  english: [
    "I'll forward this to our team so they can help you with the exact details.",
    "Let me have our team check this so they can give you the right info.",
    "I'll pass this to our team so they can assist you properly.",
  ],
  unknown: [
    "I'll forward this to our team so they can help you with the exact details.",
    "Let me have our team check this so they can give you the right info.",
    "I'll pass this to our team so they can assist you properly.",
  ],
};

function pickReply(replies: string[]) {
  return replies[Math.floor(Math.random() * replies.length)] ?? replies[0] ?? "";
}

export function detectCustomerLanguageStyle(message = ""): CustomerLanguageStyle {
  const normalizedMessage = message.toLowerCase().trim();
  const hasStrongCebuano =
    STRONG_CEBUANO_PATTERN.test(normalizedMessage) || CEBUANO_PHRASE_PATTERN.test(normalizedMessage);
  const hasWeakCebuano = WEAK_CEBUANO_PATTERN.test(normalizedMessage);
  const hasTagalog = TAGALOG_PATTERN.test(normalizedMessage);
  const hasEnglish = ENGLISH_PATTERN.test(normalizedMessage);

  if (ENGLISH_CONFIRMATION_PATTERN.test(normalizedMessage)) {
    return "english";
  }

  if (hasStrongCebuano) {
    return "cebuano";
  }

  if (hasWeakCebuano && !hasEnglish && !hasTagalog) {
    return "cebuano";
  }

  if (hasEnglish && !hasTagalog) {
    return "english";
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
  const languageStyle = detectCustomerLanguageStyle(customerMessage);

  return pickReply(MISSING_INFO_REPLIES[languageStyle]);
}

export function getLeadCapturedReply(customerMessage = "") {
  switch (detectCustomerLanguageStyle(customerMessage)) {
    case "cebuano":
      return "Salamat, nadawat na nako imong detalye. Mo-follow up ang among team nimo soon.";
    case "tagalog":
      return "Salamat, nakuha ko na ang details mo. Magfo-follow up ang team namin sa iyo soon.";
    case "taglish":
      return "Thank you po, I got your details. Our team will follow up shortly.";
    default:
      return "Thank you, I got your details. Our team will follow up shortly.";
  }
}
