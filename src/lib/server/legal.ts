import "server-only";

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

export type LegalConfiguration = {
  entityName: string;
  contactEmail: string;
  configured: boolean;
};

export function getLegalConfiguration(): LegalConfiguration {
  const entityName = clean(process.env.LEGAL_ENTITY_NAME);
  const contactEmail = clean(process.env.PRIVACY_CONTACT_EMAIL);
  const configured =
    entityName.length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

  return {
    entityName: entityName || "Chủ sở hữu deployment",
    contactEmail,
    configured,
  };
}
