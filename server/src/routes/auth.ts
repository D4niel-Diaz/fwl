import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth, signToken } from "../middleware/auth";

export const authRouter = Router();

function toAuthUser(user: { id: number; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role as "user" | "admin" };
}

authRouter.post("/register", async (req, res) => {
  const { name, email, password, role, adminCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const normalizedRole = role === "admin" ? "admin" : "user";

  // Admin sign-up requires the ADMIN_INVITE_CODE from the server's .env.
  // If ADMIN_INVITE_CODE is not set, admin sign-up is disabled entirely.
  if (normalizedRole === "admin") {
    const inviteCode = process.env.ADMIN_INVITE_CODE;
    if (!inviteCode || adminCode !== inviteCode) {
      return res.status(403).json({ error: "A valid admin invite code is required to register as admin" });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: normalizedRole },
  });

  const authUser = toAuthUser(user);
  res.status(201).json({ token: signToken(authUser), user: authUser });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const authUser = toAuthUser(user);
  res.json({ token: signToken(authUser), user: authUser });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});
