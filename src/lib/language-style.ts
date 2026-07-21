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
  /\b(?:the|and|is|are|can|do|does|how|what|when|where|price|available|order|buy|shipping|delivery|details|info|please|thanks)\b/i;

export function detectCustomerLanguageStyle(message = ""): CustomerLanguageStyle {
  const normalizedMessage = message.toLowerCase();
  const hasStrongCebuano = STRONG_CEBUANO_PATTERN.test(normalizedMessage);
  const hasWeakCebuano = WEAK_CEBUANO_PATTERN.test(normalizedMessage);
  const hasTagalog = TAGALOG_PATTERN.test(normalizedMessage);
  const hasEnglish = ENGLISH_PATTERN.test(normalizedMessage);

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
      return "I do not have that exact info yet. I can still help with other questions, or we can forward this to our team if needed.";
  }
}
