export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function validateUsername(username: string): void {
  const u = username.trim();
  if (u.length < 3) throw new Error("Username must be at least 3 characters");
  if (!/^[a-zA-Z0-9_-]+$/.test(u)) throw new Error("Username: letters, numbers, _ and - only");
}

export function validatePassword(password: string): void {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
}
