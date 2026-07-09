"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password") ?? "",
      pin: formData.get("pin") ?? "",
      redirectTo: "/scan",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid credentials." };
    }
    throw error; // NEXT_REDIRECT on success must propagate
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
