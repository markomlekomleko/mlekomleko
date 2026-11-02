import { deliveryCityForPostalCode } from "../app/lib/delivery-area";
import { listProducts } from "./products";
import { listBundles } from "./bundles";
import { getBusinessSettings, getNextDeliveryWindow, isServiceablePostalCode } from "./settings";

export async function getStorefront(postalCode?: string | null) {
  const settings = await getBusinessSettings();
  const available = postalCode ? isServiceablePostalCode(settings,postalCode) : undefined;
  const [delivery, products, bundles] = await Promise.all([
    getNextDeliveryWindow(new Date(), available ? deliveryCityForPostalCode(postalCode ?? "") ?? "" : ""),
    listProducts(false),
    listBundles(false),
  ]);
  const publicSettings = {
    indjijaEnabled: settings.indjijaEnabled && settings.indjijaDeliveryWeekdays.length > 0,
    originCowImageUrl: settings.originCowImageUrl,
    originGoatImageUrl: settings.originGoatImageUrl,
    storeName: settings.storeName,
    announcementEnabled: settings.announcementEnabled,
    announcementText: settings.announcementText,
    announcementTextEn: settings.announcementTextEn,
    announcementTextRu: settings.announcementTextRu,
    announcementTextSrCyrl: settings.announcementTextSrCyrl,
    announcementLinkLabel: settings.announcementLinkLabel,
    announcementUrl: settings.announcementUrl,
    heroEyebrow: settings.heroEyebrow,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    heroPrimaryLabel: settings.heroPrimaryLabel,
    heroPrimaryUrl: settings.heroPrimaryUrl,
    heroSecondaryLabel: settings.heroSecondaryLabel,
    heroSecondaryUrl: settings.heroSecondaryUrl,
    serviceAreaTitle: settings.serviceAreaTitle,
    serviceAreaNote: settings.serviceAreaNote,
    deliveryFeeMinor: settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    routeCapacity: settings.routeCapacity,
    guaranteeTitle: settings.guaranteeTitle,
    guaranteeText: settings.guaranteeText,
    trustItems: [settings.trustItemOne, settings.trustItemTwo, settings.trustItemThree],
    storeDemoMode: settings.storeDemoMode,
  };
  return {
    settings: publicSettings,
    delivery,
    products,
    bundles,
    serviceability: postalCode
      ? { postalCode, available }
      : undefined,
  };
}
