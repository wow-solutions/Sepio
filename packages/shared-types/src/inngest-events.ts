// Inngest event payloads — shared between apps/web (TypeScript) and
// apps/pipeline (Python via openapi-typescript generation in a later task).
//
// See wiki/architecture/sprint-0-architecture.md → "Inngest events spec".

export type BrandCreatedEvent = {
  name: "brand/created";
  data: { brand_id: string; account_id: string };
};

export type BrandWizardCompletedEvent = {
  name: "brand/wizard-completed";
  data: { brand_id: string };
};

export type PostResearchRequestedEvent = {
  name: "post/research-requested";
  data: {
    brand_id: string;
    topic_hint?: string;
    platform: string;
    language: string;
  };
};

export type PostGenerateRequestedEvent = {
  name: "post/generate-requested";
  data: {
    brand_id: string;
    research_id?: string;
    topic: string;
    platform: string;
    language: string;
  };
};

export type PostImageRequestedEvent = {
  name: "post/image-requested";
  data: { post_id: string; method: "svg_template" | "fal_flux" };
};

export type PostApprovedEvent = {
  name: "post/approved";
  data: {
    post_id: string;
    approver_account_id: string;
    scheduled_for?: string;
  };
};

export type PostPublishRequestedEvent = {
  name: "post/publish-requested";
  data: { post_id: string };
};

export type PostPublishedEvent = {
  name: "post/published";
  data: {
    post_id: string;
    external_post_id: string;
    external_post_url: string;
  };
};

export type PostPublishFailedEvent = {
  name: "post/publish-failed";
  data: { post_id: string; error: string };
};

export type BillingSubscriptionCreatedEvent = {
  name: "billing/subscription-created";
  data: {
    account_id: string;
    plan_tier: string;
    subscription_id: string;
  };
};

export type BillingSubscriptionUpdatedEvent = {
  name: "billing/subscription-updated";
  data: { account_id: string; plan_tier: string; status: string };
};

export type BillingSubscriptionCancelledEvent = {
  name: "billing/subscription-cancelled";
  data: { account_id: string; subscription_id: string };
};

export type SystemUsageCountersResetEvent = {
  name: "system/usage-counters-reset";
  data: { period_start: string };
};

export type QuoteworthyEvent =
  | BrandCreatedEvent
  | BrandWizardCompletedEvent
  | PostResearchRequestedEvent
  | PostGenerateRequestedEvent
  | PostImageRequestedEvent
  | PostApprovedEvent
  | PostPublishRequestedEvent
  | PostPublishedEvent
  | PostPublishFailedEvent
  | BillingSubscriptionCreatedEvent
  | BillingSubscriptionUpdatedEvent
  | BillingSubscriptionCancelledEvent
  | SystemUsageCountersResetEvent;

export type EventName = QuoteworthyEvent["name"];
