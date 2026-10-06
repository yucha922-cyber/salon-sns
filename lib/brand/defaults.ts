import type { BrandBrainInput } from "@/lib/domain/types";

export function emptyBrandBrainInput(): BrandBrainInput {
  return {
    companyName: "",
    brandName: "",
    industry: { key: "custom", label: "" },
    businessDescription: "",
    website: "",
    social: { instagram: "", threads: "", tiktok: "", facebook: "" },
    locations: [],
    services: [],
    serviceDescription: "",
    strengths: [],
    features: [],
    competitors: [],
    differentiators: [],
    targetAudience: { summary: "", ageRange: "", gender: "", occupation: "", painPoints: [], useCases: [] },
    personas: [],
    brandPersonality: [],
    brandTone: [],
    writingTone: "",
    marketingGoals: "",
    socialGoals: "",
    advertisingGoals: "",
    aiContext: "",
  };
}

/** Strip the persisted metadata from a BrandBrain to get the editable input. */
export function toBrandBrainInput<T extends BrandBrainInput>(brain: T): BrandBrainInput {
  const base = emptyBrandBrainInput();
  const picked = Object.fromEntries(
    (Object.keys(base) as (keyof BrandBrainInput)[]).map((key) => [key, brain[key]]),
  );
  return picked as unknown as BrandBrainInput;
}
