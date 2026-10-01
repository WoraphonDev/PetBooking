// Typed API client (05 §0). Every browser call to /api/v1 goes through `api()` or the hooks in ./query.ts.
// ENDPOINTS is GENERATED once from docs/spec/vectors/endpoints.json (webhook/cron excluded) — test/api.test.ts keeps it equal.

import { ApiError } from "@app/contracts/common";
import { ERROR_MESSAGE_TH, type ErrorCode } from "@app/contracts/errors";
import type { z } from "zod";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const ENDPOINTS = {
  "auth.staffLogin": ["POST", "/api/v1/auth/staff/login"],
  "auth.staffLogout": ["POST", "/api/v1/auth/staff/logout"],
  "auth.me": ["GET", "/api/v1/auth/staff/me"],
  "auth.resetRequest": ["POST", "/api/v1/auth/staff/password-reset/request"],
  "auth.resetConfirm": ["POST", "/api/v1/auth/staff/password-reset/confirm"],
  "auth.inviteAccept": ["POST", "/api/v1/auth/staff/invite/accept"],
  "auth.staffLine": ["POST", "/api/v1/auth/staff/line"],
  "staffMe.linkLine": ["POST", "/api/v1/staff/me/line-link"],
  "staffMe.sessions": ["GET", "/api/v1/staff/me/sessions"],
  "staffMe.revokeSession": ["DELETE", "/api/v1/staff/me/sessions/{sessionId}"],
  "staffMe.pushSubscribe": ["POST", "/api/v1/staff/me/push-subscriptions"],
  "staffMe.pushUnsubscribe": ["DELETE", "/api/v1/staff/me/push-subscriptions"],
  "staffMe.commissions": ["GET", "/api/v1/staff/me/commissions"],
  "staff.uploadUrl": ["POST", "/api/v1/staff/files/upload-url"],
  "customer.uploadUrl": ["POST", "/api/v1/liff/{branchSlug}/files/upload-url"],
  "branch.get": ["GET", "/api/v1/staff/branch"],
  "branch.update": ["PATCH", "/api/v1/staff/branch"],
  "branch.setHours": ["PUT", "/api/v1/staff/branch/hours"],
  "branch.setModules": ["PATCH", "/api/v1/staff/branch/modules"],
  "branch.updatePolicy": ["PATCH", "/api/v1/staff/branch/policy"],
  "branch.setPromptpay": ["PUT", "/api/v1/staff/branch/promptpay"],
  "closures.list": ["GET", "/api/v1/staff/branch/closures"],
  "closures.create": ["POST", "/api/v1/staff/branch/closures"],
  "closures.delete": ["DELETE", "/api/v1/staff/branch/closures/{closureId}"],
  "closures.importHolidays": ["POST", "/api/v1/staff/branch/closures/public-holidays"],
  "stations.list": ["GET", "/api/v1/staff/stations"],
  "stations.upsert": ["PUT", "/api/v1/staff/stations"],
  "line.status": ["GET", "/api/v1/staff/branch/line"],
  "line.skipped": ["GET", "/api/v1/staff/notifications/skipped"],
  "staffUsers.list": ["GET", "/api/v1/staff/staff-users"],
  "staffUsers.invite": ["POST", "/api/v1/staff/staff-users/invite"],
  "staffUsers.update": ["PATCH", "/api/v1/staff/staff-users/{staffUserId}"],
  "staffUsers.resendInvite": ["POST", "/api/v1/staff/staff-users/{staffUserId}/resend-invite"],
  "workingHours.set": ["PUT", "/api/v1/staff/staff-users/{staffUserId}/working-hours"],
  "timeOff.list": ["GET", "/api/v1/staff/time-off"],
  "timeOff.create": ["POST", "/api/v1/staff/time-off"],
  "timeOff.delete": ["DELETE", "/api/v1/staff/time-off/{timeOffId}"],
  "search.quick": ["GET", "/api/v1/staff/search"],
  "customers.list": ["GET", "/api/v1/staff/customers"],
  "customers.create": ["POST", "/api/v1/staff/customers"],
  "customers.get": ["GET", "/api/v1/staff/customers/{customerId}"],
  "customers.update": ["PATCH", "/api/v1/staff/customers/{customerId}"],
  "customers.blacklist": ["POST", "/api/v1/staff/customers/{customerId}/blacklist"],
  "customers.reliabilityOverride": ["PUT", "/api/v1/staff/customers/{customerId}/reliability-override"],
  "customers.timeline": ["GET", "/api/v1/staff/customers/{customerId}/timeline"],
  "customers.credit": ["POST", "/api/v1/staff/customers/{customerId}/credit-adjustments"],
  "customers.packages": ["GET", "/api/v1/staff/customers/{customerId}/packages"],
  "pets.create": ["POST", "/api/v1/staff/customers/{customerId}/pets"],
  "pets.get": ["GET", "/api/v1/staff/pets/{petId}"],
  "pets.update": ["PATCH", "/api/v1/staff/pets/{petId}"],
  "pets.setStatus": ["POST", "/api/v1/staff/pets/{petId}/status"],
  "pets.updateShopProfile": ["PUT", "/api/v1/staff/pets/{petId}/shop-profile"],
  "pets.addWeight": ["POST", "/api/v1/staff/pets/{petId}/weights"],
  "pets.setFlags": ["PUT", "/api/v1/staff/pets/{petId}/temperament-flags"],
  "vaccinations.create": ["POST", "/api/v1/staff/pets/{petId}/vaccinations"],
  "vaccinations.verify": ["POST", "/api/v1/staff/vaccinations/{vaccinationId}/verify"],
  "vaccinations.reject": ["POST", "/api/v1/staff/vaccinations/{vaccinationId}/reject"],
  "photos.list": ["GET", "/api/v1/staff/pets/{petId}/photos"],
  "photos.add": ["POST", "/api/v1/staff/pets/{petId}/photos"],
  "linkRequests.list": ["GET", "/api/v1/staff/link-requests"],
  "linkRequests.approve": ["POST", "/api/v1/staff/link-requests/{requestId}/approve"],
  "linkRequests.reject": ["POST", "/api/v1/staff/link-requests/{requestId}/reject"],
  "sizeTiers.list": ["GET", "/api/v1/staff/size-tiers"],
  "sizeTiers.set": ["PUT", "/api/v1/staff/size-tiers"],
  "services.list": ["GET", "/api/v1/staff/services"],
  "services.create": ["POST", "/api/v1/staff/services"],
  "services.update": ["PATCH", "/api/v1/staff/services/{serviceId}"],
  "services.setPrices": ["PUT", "/api/v1/staff/services/{serviceId}/prices"],
  "services.setAddonLinks": ["PUT", "/api/v1/staff/services/{serviceId}/addon-links"],
  "surchargeTypes.list": ["GET", "/api/v1/staff/surcharge-types"],
  "surchargeTypes.upsert": ["PUT", "/api/v1/staff/surcharge-types"],
  "roomTypes.list": ["GET", "/api/v1/staff/room-types"],
  "roomTypes.create": ["POST", "/api/v1/staff/room-types"],
  "roomTypes.update": ["PATCH", "/api/v1/staff/room-types/{roomTypeId}"],
  "roomTypes.setRates": ["PUT", "/api/v1/staff/room-types/{roomTypeId}/rates"],
  "roomUnits.list": ["GET", "/api/v1/staff/room-units"],
  "roomUnits.upsert": ["PUT", "/api/v1/staff/room-units"],
  "roomUnits.housekeeping": ["PATCH", "/api/v1/staff/room-units/{roomUnitId}/housekeeping"],
  "daycareTypes.list": ["GET", "/api/v1/staff/daycare-session-types"],
  "daycareTypes.upsert": ["PUT", "/api/v1/staff/daycare-session-types"],
  "packageTemplates.list": ["GET", "/api/v1/staff/package-templates"],
  "packageTemplates.upsert": ["PUT", "/api/v1/staff/package-templates"],
  "commissionRules.list": ["GET", "/api/v1/staff/commission-rules"],
  "commissionRules.set": ["PUT", "/api/v1/staff/commission-rules"],
  "imports.create": ["POST", "/api/v1/staff/imports"],
  "imports.get": ["GET", "/api/v1/staff/imports/{importId}"],
  "imports.commit": ["POST", "/api/v1/staff/imports/{importId}/commit"],
  "availability.groomSlots": ["POST", "/api/v1/staff/availability/groom-slots"],
  "availability.hotel": ["GET", "/api/v1/staff/availability/hotel"],
  "availability.daycare": ["GET", "/api/v1/staff/availability/daycare"],
  "quotes.create": ["POST", "/api/v1/staff/quotes"],
  "bookings.create": ["POST", "/api/v1/staff/bookings"],
  "bookings.list": ["GET", "/api/v1/staff/bookings"],
  "bookings.get": ["GET", "/api/v1/staff/bookings/{bookingId}"],
  "bookings.approve": ["POST", "/api/v1/staff/bookings/{bookingId}/approve"],
  "bookings.decline": ["POST", "/api/v1/staff/bookings/{bookingId}/decline"],
  "bookings.cancelPreview": ["GET", "/api/v1/staff/bookings/{bookingId}/cancel-preview"],
  "bookings.cancel": ["POST", "/api/v1/staff/bookings/{bookingId}/cancel"],
  "bookings.recordDeposit": ["POST", "/api/v1/staff/bookings/{bookingId}/deposit"],
  "bookings.waiveDeposit": ["POST", "/api/v1/staff/bookings/{bookingId}/deposit/waive"],
  "bookings.balanceLink": ["POST", "/api/v1/staff/bookings/{bookingId}/balance-link"],
  "calendar.day": ["GET", "/api/v1/staff/calendar"],
  "groom.reschedule": ["PATCH", "/api/v1/staff/groom-appointments/{appointmentId}/reschedule"],
  "groom.setItems": ["PUT", "/api/v1/staff/groom-appointments/{appointmentId}/items"],
  "groom.checkIn": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/check-in"],
  "groom.start": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/start"],
  "groom.finish": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/finish"],
  "groom.notifyPickup": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/notify-pickup"],
  "groom.pickUp": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/pick-up"],
  "groom.noShow": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/no-show"],
  "groom.cancel": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/cancel"],
  "groom.addSurcharge": ["POST", "/api/v1/staff/groom-appointments/{appointmentId}/surcharges"],
  "groom.removeSurcharge": ["DELETE", "/api/v1/staff/appointment-surcharges/{surchargeId}"],
  "groom.jobCard": ["GET", "/api/v1/staff/groom-appointments/{appointmentId}/job-card"],
  "groom.myQueue": ["GET", "/api/v1/staff/me/queue"],
  "stays.today": ["GET", "/api/v1/staff/stays"],
  "stays.get": ["GET", "/api/v1/staff/stays/{stayId}"],
  "stays.saveIntake": ["PUT", "/api/v1/staff/stays/{stayId}/intake"],
  "stays.signAgreement": ["POST", "/api/v1/staff/stays/{stayId}/agreement"],
  "stays.checkIn": ["POST", "/api/v1/staff/stays/{stayId}/check-in"],
  "stays.changeRoom": ["PATCH", "/api/v1/staff/stays/{stayId}/room"],
  "stays.changeDates": ["PATCH", "/api/v1/staff/stays/{stayId}/dates"],
  "stays.addAddon": ["POST", "/api/v1/staff/stays/{stayId}/addons"],
  "stays.removeAddon": ["DELETE", "/api/v1/staff/stay-addons/{stayAddonId}"],
  "stays.postUpdate": ["POST", "/api/v1/staff/stays/{stayId}/updates"],
  "stays.checkOut": ["POST", "/api/v1/staff/stays/{stayId}/check-out"],
  "stays.noShow": ["POST", "/api/v1/staff/stays/{stayId}/no-show"],
  "stays.cancel": ["POST", "/api/v1/staff/stays/{stayId}/cancel"],
  "roomMap.get": ["GET", "/api/v1/staff/room-map"],
  "careTasks.list": ["GET", "/api/v1/staff/care-tasks"],
  "careTasks.done": ["POST", "/api/v1/staff/care-tasks/{taskId}/done"],
  "careTasks.skip": ["POST", "/api/v1/staff/care-tasks/{taskId}/skip"],
  "daycare.list": ["GET", "/api/v1/staff/daycare-visits"],
  "daycare.check_in": ["POST", "/api/v1/staff/daycare-visits/{visitId}/check-in"],
  "daycare.check_out": ["POST", "/api/v1/staff/daycare-visits/{visitId}/check-out"],
  "daycare.no_show": ["POST", "/api/v1/staff/daycare-visits/{visitId}/no-show"],
  "daycare.cancel": ["POST", "/api/v1/staff/daycare-visits/{visitId}/cancel"],
  "slips.list": ["GET", "/api/v1/staff/slips"],
  "slips.verify": ["POST", "/api/v1/staff/slips/{slipId}/verify"],
  "slips.reject": ["POST", "/api/v1/staff/slips/{slipId}/reject"],
  "refunds.create": ["POST", "/api/v1/staff/refunds"],
  "bills.open": ["POST", "/api/v1/staff/bills"],
  "bills.list": ["GET", "/api/v1/staff/bills"],
  "bills.get": ["GET", "/api/v1/staff/bills/{billId}"],
  "bills.addLine": ["POST", "/api/v1/staff/bills/{billId}/lines"],
  "bills.updateLine": ["PATCH", "/api/v1/staff/bill-lines/{lineId}"],
  "bills.removeLine": ["DELETE", "/api/v1/staff/bill-lines/{lineId}"],
  "bills.setDiscount": ["PATCH", "/api/v1/staff/bills/{billId}/discount"],
  "bills.addPayment": ["POST", "/api/v1/staff/bills/{billId}/payments"],
  "bills.voidPayment": ["POST", "/api/v1/staff/payments/{paymentId}/void"],
  "bills.promptpayQr": ["GET", "/api/v1/staff/bills/{billId}/promptpay-qr"],
  "bills.close": ["POST", "/api/v1/staff/bills/{billId}/close"],
  "bills.void": ["POST", "/api/v1/staff/bills/{billId}/void"],
  "bills.receipt": ["GET", "/api/v1/staff/bills/{billId}/receipt"],
  "bills.sendReceipt": ["POST", "/api/v1/staff/bills/{billId}/send-receipt"],
  "reportCards.list": ["GET", "/api/v1/staff/report-cards"],
  "reportCards.get": ["GET", "/api/v1/staff/report-cards/{reportCardId}"],
  "reportCards.update": ["PUT", "/api/v1/staff/report-cards/{reportCardId}"],
  "reportCards.submit": ["POST", "/api/v1/staff/report-cards/{reportCardId}/submit"],
  "reportCards.approve": ["POST", "/api/v1/staff/report-cards/{reportCardId}/approve"],
  "dashboard.today": ["GET", "/api/v1/staff/dashboard/today"],
  "reports.sales": ["GET", "/api/v1/staff/reports/sales"],
  "reports.commissions": ["GET", "/api/v1/staff/reports/commissions"],
  "reports.occupancy": ["GET", "/api/v1/staff/reports/occupancy"],
  "exports.csv": ["GET", "/api/v1/staff/exports/{type}.csv"],
  "audit.list": ["GET", "/api/v1/staff/audit-logs"],
  "feedback.create": ["POST", "/api/v1/staff/feedback"],
  "liff.session": ["POST", "/api/v1/liff/{branchSlug}/session"],
  "liff.register": ["POST", "/api/v1/liff/{branchSlug}/register"],
  "liff.me": ["GET", "/api/v1/liff/{branchSlug}/me"],
  "liff.updateMe": ["PATCH", "/api/v1/liff/{branchSlug}/me"],
  "liff.shop": ["GET", "/api/v1/liff/{branchSlug}/shop"],
  "liff.pets": ["GET", "/api/v1/liff/{branchSlug}/pets"],
  "liff.createPet": ["POST", "/api/v1/liff/{branchSlug}/pets"],
  "liff.updatePet": ["PATCH", "/api/v1/liff/{branchSlug}/pets/{petId}"],
  "liff.addVaccination": ["POST", "/api/v1/liff/{branchSlug}/pets/{petId}/vaccinations"],
  "liff.groomSlots": ["POST", "/api/v1/liff/{branchSlug}/availability/groom-slots"],
  "liff.hotelAvailability": ["GET", "/api/v1/liff/{branchSlug}/availability/hotel"],
  "liff.daycareAvailability": ["GET", "/api/v1/liff/{branchSlug}/availability/daycare"],
  "liff.quote": ["POST", "/api/v1/liff/{branchSlug}/quotes"],
  "liff.createBooking": ["POST", "/api/v1/liff/{branchSlug}/bookings"],
  "liff.bookings": ["GET", "/api/v1/liff/{branchSlug}/bookings"],
  "liff.booking": ["GET", "/api/v1/liff/{branchSlug}/bookings/{bookingId}"],
  "liff.uploadSlip": ["POST", "/api/v1/liff/{branchSlug}/bookings/{bookingId}/slips"],
  "liff.cancel": ["POST", "/api/v1/liff/{branchSlug}/bookings/{bookingId}/cancel"],
  "liff.reschedule": ["POST", "/api/v1/liff/{branchSlug}/bookings/{bookingId}/reschedule"],
  "liff.ics": ["GET", "/api/v1/liff/{branchSlug}/bookings/{bookingId}/calendar.ics"],
  "liff.stayUpdates": ["GET", "/api/v1/liff/{branchSlug}/stays/{stayId}/updates"],
  "liff.reportCard": ["GET", "/api/v1/liff/{branchSlug}/report-cards/{reportCardId}"],
  "liff.rate": ["POST", "/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/rating"],
  "liff.reviewClick": ["POST", "/api/v1/liff/{branchSlug}/report-cards/{reportCardId}/review-click"],
  "liff.packages": ["GET", "/api/v1/liff/{branchSlug}/packages"],
  "liff.receipt": ["GET", "/api/v1/liff/{branchSlug}/receipts/{billId}"],
  "liff.payPage": ["GET", "/api/v1/liff/{branchSlug}/pay/{billId}"],
  "liff.payUploadSlip": ["POST", "/api/v1/liff/{branchSlug}/pay/{billId}/slips"],
  "liff.dataRequest": ["POST", "/api/v1/liff/{branchSlug}/data-requests"],
  "public.branch": ["GET", "/api/v1/public/branches/{bookingSlug}"],
  health: ["GET", "/api/health"],
  "admin.login": ["POST", "/api/v1/auth/admin/login"],
  "admin.orgs": ["GET", "/api/v1/admin/organizations"],
  "admin.createOrg": ["POST", "/api/v1/admin/organizations"],
  "admin.updateOrg": ["PATCH", "/api/v1/admin/organizations/{orgId}"],
  "admin.setLineChannel": ["PUT", "/api/v1/admin/branches/{branchId}/line-channel"],
  "admin.verifyLine": ["POST", "/api/v1/admin/branches/{branchId}/line-channel/verify"],
  "admin.supportStart": ["POST", "/api/v1/admin/support-sessions"],
  "admin.supportEnd": ["POST", "/api/v1/admin/support-sessions/{supportId}/end"],
  "admin.feedback": ["GET", "/api/v1/admin/feedback"],
  "admin.updateFeedback": ["PATCH", "/api/v1/admin/feedback/{feedbackId}"],
  "admin.dataRequests": ["GET", "/api/v1/admin/data-requests"],
  "admin.resolveDataRequest": ["POST", "/api/v1/admin/data-requests/{requestId}/resolve"],
  "admin.analytics": ["GET", "/api/v1/admin/analytics/pilot"],
  "admin.holidays": ["PUT", "/api/v1/admin/public-holidays/{year}"],
} as const satisfies Record<string, readonly [Method, string]>;

export type EndpointKey = keyof typeof ENDPOINTS;

export type ApiInput<TResponse = unknown> = {
  /** Values for `{name}` path segments. */
  params?: Record<string, string>;
  /** Query string; `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** `<Key>Response` from `@app/contracts/endpoints/<key>` — types the result and is parsed outside production. */
  response?: z.ZodType<TResponse>;
  signal?: AbortSignal;
};

/** Error thrown by `api()`: the server's `{ error: { code, message, details } }` (message is Thai, safe to show). */
export class ApiClientError extends Error {
  override readonly name = "ApiClientError";
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function buildUrl(key: EndpointKey, params: ApiInput["params"] = {}, query: ApiInput["query"] = {}): string {
  const path = ENDPOINTS[key][1].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`api(${key}): missing path param "${name}"`);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.set(name, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Calls endpoint `key`. Resolves the JSON body (`undefined` for 204); rejects with ApiClientError. */
export async function api<TResponse = unknown>(key: EndpointKey, input: ApiInput<TResponse> = {}): Promise<TResponse> {
  const [method] = ENDPOINTS[key];
  const hasBody = input.body !== undefined;
  let res: Response;
  try {
    res = await fetch(buildUrl(key, input.params, input.query), {
      method,
      credentials: "same-origin",
      headers: hasBody ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: hasBody ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (err) {
    if (input.signal?.aborted) throw err;
    throw new ApiClientError("INTERNAL", ERROR_MESSAGE_TH.INTERNAL, 0);
  }

  if (res.status === 204) return undefined as TResponse;
  const json: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = ApiError.safeParse(json);
    if (!parsed.success) throw new ApiClientError("INTERNAL", ERROR_MESSAGE_TH.INTERNAL, res.status);
    const { code, message, details } = parsed.data.error;
    throw new ApiClientError(code, message, res.status, details);
  }

  if (input.response && process.env.NODE_ENV !== "production") {
    const parsed = input.response.safeParse(json);
    if (!parsed.success) throw new Error(`api(${key}): response does not match contract\n${parsed.error.message}`);
  }
  return json as TResponse;
}

/** Thai message to show for any error thrown by api()/hooks. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : ERROR_MESSAGE_TH.INTERNAL;
}
