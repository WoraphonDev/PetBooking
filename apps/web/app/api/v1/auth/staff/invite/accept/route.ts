import { AuthInviteAcceptRequest } from "@app/contracts/endpoints/auth.inviteAccept";
import { withPublic } from "@app/server/http";
import { authInviteAccept } from "@app/server/services/auth/inviteAccept";

export const POST = withPublic("auth.inviteAccept", { body: AuthInviteAcceptRequest }, authInviteAccept);
