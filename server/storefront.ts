import { listProducts } from "./products";
import { listBundles } from "./bundles";
import { getBusinessSettings, getNextDeliveryWindow, isServiceablePostalCode } from "./settings";

export async function getStorefront(postalCode?: string | null) {
  const [settings, delivery, products, bundles] = await Promise.all([
    getBusinessSettings(),
    getNextDeliveryWindow(),
    listProducts(false),
    listBundles(false),
  ]);
  const publicSettings = {
    storeName: settings.storeName,
    announcementEnabled: settings.announcementEnabled,
    announcementText: settings.announcementText,
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
      ? { postalCode, available: isServiceablePostalCode(settings, postalCode) }
      : undefined,
  };
}
