import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuthRepository } from "../../../../db/repositories/auth-repository";
import { createAuthService } from "../../../server/auth-service";
import { createEmailSender } from "../../../server/email";
import {
  canExposeDevelopmentVerifyUrl,
  readServerEnvironment,
} from "../../../server/env";
import {
  assertSameOrigin,
  requesterIdentityForRequest,
  SameOriginError,
} from "../../../server/request-security";

const requestSchema = z.object({ email: z.string() });
const acceptedMessage = "If that email can sign in, a link is on its way.";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof SameOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const environment = readServerEnvironment();
    const requestOrigin = new URL(request.url).origin;
    const service = createAuthService({
      repository: createAuthRepository(),
      emailSender: createEmailSender({
        environment: environment.environment,
        apiKey: environment.resendApiKey,
        from: environment.emailFrom,
      }),
      sessionSecret: environment.sessionSecret,
      environment: environment.environment,
      exposeDevelopmentVerifyUrl: canExposeDevelopmentVerifyUrl(
        environment,
        requestOrigin,
      ),
    });
    const result = await service.requestMagicLink({
      email: body.data.email,
      origin: requestOrigin,
      requesterIdentity: requesterIdentityForRequest(
        request,
        environment.environment,
      ),
    });

    return NextResponse.json({ message: acceptedMessage, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }
    throw error;
  }
}
