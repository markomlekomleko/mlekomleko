/**
 * Legal details shown in the footer, the way Kafeterija lists theirs, so the shop reads
 * as a real registered business. Source: the APR record of the operating company
 * (via CompanyWall, supplied by the client on 17 Nov 2026). An empty field is left out.
 */
export const company = {
  legalName: "Three & More d.o.o.",
  address: "Mirka Milojkovića 19, 11000 Beograd",
  registrationNumber: "21788937",
  taxId: "113014356",
  email: "threeandmoreserbia@gmail.com",
  phone: "060 502 23 23",
  phoneHref: "tel:+381605022323",
} as const;

/** The footer's legal line after the registered name, in Kafeterija's order. */
export function companyLine(): string[] {
  return [
    company.address,
    company.registrationNumber ? `MB ${company.registrationNumber}` : "",
    company.taxId ? `PIB ${company.taxId}` : "",
    company.email,
  ].filter(Boolean);
}
