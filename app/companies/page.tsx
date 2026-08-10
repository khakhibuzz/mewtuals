import { ForCompanies } from "../components/ForCompanies";
import { SiteHeader } from "../components/SiteHeader";

export default function CompaniesPage() {
  return (
    <>
      <SiteHeader />
      <main className="companies-page">
        <ForCompanies />
      </main>
    </>
  );
}
