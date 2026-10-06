import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { LocationCustomizer } from "@/components/locations/location-customizer";

export default async function LocationsPage() {
  const { repo, current, brain } = await requireAppContext();
  const orgId = current.organization.id;
  const [profiles, accounts] = await Promise.all([repo.listLocationProfiles(orgId), repo.listAccounts(orgId)]);
  return (
    <>
      <PageHeading eyebrow="本部・店舗" title="店舗カスタマイズ"
        description="エリア・客層・サービス・スタッフ・オファー・ローカルキーワードを店舗ごとに設定。本部の投稿を各店舗向けに自動でローカライズします。" />
      <LocationCustomizer profiles={profiles} services={brain.services.map((s) => s.name)} accounts={accounts} readOnly={current.role === "viewer"} />
    </>
  );
}
