/**
 * Original photos of the laboratory reports (spec 19 Nov 2026, §11), shown as they are —
 * no filters, no search and no long interpretation. Add each report's photo under
 * public/images/analize/ and list it here, newest first. `label` is a short caption,
 * e.g. the date of the analysis as written on the report.
 */
export type LabReport = { src: string; width: number; height: number; label: string };

export const labReports: readonly LabReport[] = [];
