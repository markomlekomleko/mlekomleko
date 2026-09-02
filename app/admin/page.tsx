import type { Metadata } from "next";
import { AdminDashboard } from "./admin-dashboard";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Administracija",
  alternates: { canonical: canonicalUrl("/admin") },
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
