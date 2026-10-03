import { AuthInvitePreviewQuery } from "@app/contracts/endpoints/auth.invitePreview";
import { withPublic } from "@app/server/http";
import { authInvitePreview } from "@app/server/services/auth/invitePreview";

export const GET = withPublic("auth.invitePreview", { query: AuthInvitePreviewQuery }, authInvitePreview);
