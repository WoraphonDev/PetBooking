import { z } from "zod";
import { InvitePreview } from "../dto/invite-preview.ts";

export const AuthInvitePreviewQuery = z.object({ token: z.string().min(1) });
export type AuthInvitePreviewQuery = z.infer<typeof AuthInvitePreviewQuery>;
export const AuthInvitePreviewRequest = AuthInvitePreviewQuery;
export type AuthInvitePreviewRequest = AuthInvitePreviewQuery;
export const AuthInvitePreviewResponse = InvitePreview;
export type AuthInvitePreviewResponse = z.infer<typeof AuthInvitePreviewResponse>;
